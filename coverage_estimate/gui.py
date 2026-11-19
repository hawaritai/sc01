"""Small PyQt desktop wrapper around the visibility engine."""

from __future__ import annotations

from pathlib import Path
import traceback

from PyQt5.QtCore import QThread, pyqtSignal
from PyQt5.QtWidgets import (
    QApplication, QCheckBox, QComboBox, QFileDialog, QFormLayout,
    QHBoxLayout, QLabel, QLineEdit, QMainWindow, QMessageBox, QPushButton,
    QSpinBox, QTextEdit, QVBoxLayout, QWidget,
)

from engine import available_groups, companion_polygon, run


class RunThread(QThread):
    message = pyqtSignal(str)
    completed = pyqtSignal(object, str)

    def __init__(self, options: dict):
        super().__init__()
        self.options = options
        self._cancel = False

    def cancel(self):
        self._cancel = True

    def run(self):
        try:
            rows = run(**self.options, progress=self.message.emit,
                       cancelled=lambda: self._cancel)
            self.completed.emit(rows, "")
        except Exception:
            self.completed.emit([], traceback.format_exc())


class Window(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Planned-image occlusion masks")
        self.resize(760, 580)
        self.thread = None
        self.groups = {}
        center = QWidget()
        self.setCentralWidget(center)
        layout = QVBoxLayout(center)
        form = QFormLayout()
        layout.addLayout(form)
        self.point = QLineEdit()
        self.dsm = QLineEdit()
        self.output = QLineEdit()
        for label, edit, kind in (
            ("Flight plan points", self.point, "point"),
            ("DSM GeoTIFF", self.dsm, "dsm"),
            ("Output folder", self.output, "output"),
        ):
            row = QHBoxLayout()
            row.addWidget(edit)
            button = QPushButton("Browse…")
            button.clicked.connect(lambda _, e=edit, k=kind: self.browse(e, k))
            row.addWidget(button)
            form.addRow(label, row)
        self.point.editingFinished.connect(self.load_groups)
        self.aoi = QComboBox()
        self.line = QComboBox()
        self.aoi.currentTextChanged.connect(self.update_lines)
        form.addRow("AOI", self.aoi)
        form.addRow("Flight line", self.line)
        self.limit = QSpinBox()
        self.limit.setRange(1, 100000)
        self.limit.setValue(10)
        form.addRow("Max exposures this run", self.limit)
        self.overwrite = QCheckBox("Replace existing masks")
        form.addRow("", self.overwrite)
        info = QLabel("Assumed nadir. Camera Z and DSM heights must share a vertical datum.\n"
                      "Masks: 0 outside, 1 visible, 2 occluded, 255 unknown.")
        info.setWordWrap(True)
        layout.addWidget(info)
        actions = QHBoxLayout()
        self.start = QPushButton("Calculate masks")
        self.stop = QPushButton("Cancel after current exposure")
        self.stop.setEnabled(False)
        self.start.clicked.connect(self.start_run)
        self.stop.clicked.connect(self.cancel_run)
        actions.addWidget(self.start)
        actions.addWidget(self.stop)
        layout.addLayout(actions)
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        layout.addWidget(self.log)

    def browse(self, edit: QLineEdit, kind: str):
        if kind == "output":
            path = QFileDialog.getExistingDirectory(self, "Select output folder")
        else:
            label = "Shapefiles (*.shp)" if kind == "point" else "GeoTIFF (*.tif *.tiff)"
            path, _ = QFileDialog.getOpenFileName(self, "Select file", "", label)
        if path:
            edit.setText(path)
            if kind == "point":
                self.load_groups()

    def load_groups(self):
        path = self.point.text().strip()
        if not path:
            return
        try:
            polygon = companion_polygon(path)
            if not polygon.is_file():
                raise FileNotFoundError(f"Matching polygon layer not found: {polygon}")
            self.groups = available_groups(path)
            self.aoi.blockSignals(True)
            self.aoi.clear()
            self.aoi.addItems(self.groups)
            self.aoi.blockSignals(False)
            self.update_lines()
            self.log.append(f"Loaded plan: {len(self.groups)} AOIs; polygon layer: {polygon}")
        except Exception as exc:
            self.groups = {}
            self.aoi.clear()
            self.line.clear()
            self.log.append(f"ERROR loading flight plan: {exc}")

    def update_lines(self):
        self.line.clear()
        self.line.addItems(self.groups.get(self.aoi.currentText(), []))

    def start_run(self):
        if self.thread is not None:
            return
        point = self.point.text().strip()
        dsm = self.dsm.text().strip()
        output = self.output.text().strip()
        if not point or not Path(point).is_file() or not dsm or not Path(dsm).is_file():
            QMessageBox.warning(self, "Missing input", "Select a valid point shapefile and DSM GeoTIFF.")
            return
        if not output or not self.aoi.currentText() or not self.line.currentText():
            QMessageBox.warning(self, "Missing selection", "Select an output folder, AOI, and flight line.")
            return
        options = dict(point_path=point, dsm_path=dsm, output_dir=output,
                       aoi=self.aoi.currentText(), line=self.line.currentText(),
                       limit=self.limit.value(), overwrite=self.overwrite.isChecked())
        self.thread = RunThread(options)
        self.thread.message.connect(self.log.append)
        self.thread.completed.connect(self.run_completed)
        self.start.setEnabled(False)
        self.stop.setEnabled(True)
        self.log.append("Starting visibility calculation…")
        self.thread.start()

    def cancel_run(self):
        if self.thread:
            self.thread.cancel()
            self.stop.setEnabled(False)

    def run_completed(self, rows, error):
        self.start.setEnabled(True)
        self.stop.setEnabled(False)
        thread = self.thread
        self.thread = None
        if thread:
            thread.wait()
            thread.deleteLater()
        if error:
            self.log.append(error)
            QMessageBox.critical(self, "Processing failed", error.splitlines()[-1])
        else:
            failures = sum(bool(row["error"]) for row in rows)
            self.log.append(f"Run complete: {len(rows) - failures} masks, {failures} errors.")

    def closeEvent(self, event):
        if self.thread is not None:
            self.thread.cancel()
            self.thread.wait()
        super().closeEvent(event)


def launch() -> int:
    app = QApplication.instance() or QApplication([])
    window = Window()
    window.show()
    return app.exec_()
