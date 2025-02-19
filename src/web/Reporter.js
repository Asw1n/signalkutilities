class Reporter {
  constructor() {
    this.report = {};
    this.options = null;
  }

  newReport() {
    this.report = {
      timestamp: new Date(),
      options: null,
      polarSteps: [
      ],
      attitudeSteps: [
      ],
      deltas: [
      ],
      tables: [],
    };
  }

  addOptions(options) {
    this.report.options =options;
  }

  addPolar(polar) {
    this.report.polarSteps.push(
      {
        id: polar.id,
        label: polar.label,
        plane: polar.plane,
        speed: (polar.pValue.speed),
        angle: (polar.pValue.angle)
      });
  }

  addAttitude(delta) {
    this.report.attitudeSteps.push(
      {
        id: delta.id,
        label: delta.label,
        roll: (delta.value.roll),
        pitch: (delta.value.pitch),
      }
    );
  }

  addRotation(delta) {
    this.report.attitudeSteps.push(
      {
        id: delta.id,
        label: delta.label,
        roll: (delta.roll),
        pitch: (delta.pitch),
      }
    );
  }

  addDelta(delta) {
    this.report.deltas.push(
      {
        id: delta.id,
        label: delta.label,
        value: (delta.value),
      }
    );

  }

  addTable(table, speed, heel) {
    const data = table.getInfo();
    data.selected = table.getIndices(speed, heel);
    data.id = table.id;
    data.label = table.label;
    this.report.tables.push(data);
  }

  getReport() {
    return this.report;
  }
}

module.exports = Reporter;
