$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$lists = Get-ChildItem -LiteralPath $root -Filter '*_partial_downloadable_urls.txt' -File

if (-not $lists) {
    Write-Error "No *_partial_downloadable_urls.txt files found in $root"
    exit 1
}

foreach ($list in $lists) {
    $folderName = [System.IO.Path]::GetFileNameWithoutExtension($list.Name) -replace '_downloadable_urls$', ''
    $destination = Join-Path $root $folderName
    New-Item -ItemType Directory -Force -Path $destination | Out-Null

    $urls = @(Get-Content -LiteralPath $list.FullName | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    Write-Host ""
    Write-Host "$($list.Name): $($urls.Count) files -> $destination"

    foreach ($source in $urls) {
        $url = $source -replace '^gs://', 'https://storage.googleapis.com/'
        $uri = [uri]$url
        $segments = $uri.AbsolutePath.Trim('/') -split '/'
        $leaf = $segments[-1]
        if ($segments.Count -gt 1) {
            $leaf = "$($segments[-2])_$leaf"
        }
        $target = Join-Path $destination $leaf

        if ((Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -gt 0) {
            Write-Host "Already downloaded: $leaf"
            continue
        }

        Write-Host "Downloading $leaf"
        & curl.exe --fail --location --retry 3 --output $target $url
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Download failed ($LASTEXITCODE): $url"
            Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
        }
    }
}
