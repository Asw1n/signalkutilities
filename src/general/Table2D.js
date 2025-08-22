class Table2D {
  constructor(row = { min: 0, max: 10, step: 1 }, col = { min: 0, max: 10, step: 1 }, ClassType, param) {
    this.min = [row.min, col.min];
    this.max = [row.max, col.max];
    this.step = [row.step, col.step];
    this.n = [0, 0]; // Initialize the n array
    this.ClassType = ClassType;
    this.parameters = param;
    this.displayAttributes = {};
    for (let i = 0; i < 2; i++) {
      this.n[i] = Math.round((this.max[i] - this.min[i]) / this.step[i] + 1);
    }

    this.table = Array.from({ length: this.n[0] }, () =>
      Array.from({ length: this.n[1] }, () => new ClassType(param))
    );
  }

  setDisplayAttributes(atrr) {
    this.displayAttributes = atrr;
  }
  getCell(rowValue, colValue) {
    // console.log("getCell");
    // console.log(rowValue, colValue);
    // console.log(this.getIndex(rowValue, 0), this.getIndex(colValue, 1));
    // console.log(this.table[0][0]);
    // console.log(this.table[this.getIndex(rowValue, 0), this.getIndex(colValue, 1)]);
    return this.table[this.getIndex(rowValue, 0)][this.getIndex(colValue, 1)]; 
  }

  toJSON() {
    return {
      row: { min: this.min[0], max: this.max[0], step: this.step[0] },
      col: { min: this.min[1], max: this.max[1], step: this.step[1] },
      parameters: this.parameters,
      table: this.table.map(row => row.map(cell => cell.toJSON()))
    };
  }

  static fromJSON(data, ClassType) {
    const table = new Table2D(data.row, data.col, ClassType, data.parameters);
    table.table = data.table.map(row => row.map(cellData => ClassType.fromJSON(cellData)));
    return table;
  }

  getIndex(value, dim) {
    if (value < this.min[dim]) return 0;
    if (value > this.max[dim]) return this.n[dim] - 1;
    return Math.round((value - this.min[dim]) / this.step[dim]);
  }

  getIndices(rowValue, colValue) {
    return [this.getIndex(rowValue, 0), this.getIndex(colValue, 1)];
  }

  indexToValue(index, dim) {
    return index * this.step[dim] + this.min[dim];
  }

  findNeighbours(rowValue, colValue) {
    const neighbours = [];
    const xFloor = Math.floor((rowValue - this.min[0]) / this.step[0]);
    const yFloor = Math.floor((colValue - this.min[1]) / this.step[1]);
    for (let x = xFloor; x <= xFloor + 1; x++) {
      for (let y = yFloor; y <= yFloor + 1; y++) {
        if (x >= 0 && x < this.n[0] && y >= 0 && y < this.n[1]) {
          const xdist = Math.abs(this.indexToValue(x, 0) - rowValue) / this.step[0];
          const ydist = Math.abs(this.indexToValue(y, 1) - colValue) / this.step[1];
          const neighbour = { cell: this.table[x][y], xdist: xdist, ydist: ydist };
          neighbours.push(neighbour);
        }
      }
    }
    return neighbours;
  }
}

module.exports = Table2D;
