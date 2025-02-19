const { Table2D } = require('../../index');
console.log("Testing Table2D");
const mod = require('../../index');
console.log(mod); // See what is being imported

class Mean {
  constructor(mean = null, n = 0) {
    if (mean != undefined)
      this.m = mean;
    else 
      this.m = null;
    if (n != undefined)
      this.n = n;
    else
      this.n = 0;
  }
  toJSON() {
    return { mean: this.m, n: this.n };
  }

  static fromJSON(data) {
    return new Mean(data.mean, data.n);
  }

  addObs(value) {
    this.n += 1;
    if (this.n == 1) {
      this.m = value;
   }
    else {
      this.m += (value - this.m) / this.n;
    }
  }
}

const row = {min:0, max: 8, step: 1};
const col = { min: -24, max: 24, step: 8 };

const ClassName = Mean;
const param = null;;
const table = new Table2D(row, col, ClassName, param);
console.log(table.getCell(0, 0).toJSON());
table.getCell(0, 0).addObs(4);
table.getCell(0, 0).addObs(2);
console.log(table.getCell(0, 0).toJSON());
const j = table.toJSON();
const table2 = Table2D.fromJSON(j, Mean);
console.log(table2.getCell(0, 0).toJSON());
console.log(table.getIndices(0, 30));
console.log(table.getIndices(4, 14));


