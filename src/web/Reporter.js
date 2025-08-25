class Reporter {
  constructor() {
    this.deltas = [];
    this.polars = [];
    this.tables = [];
    this.attitudes = [];
  }

setDeltas(deltas) {
    this.deltas = deltas;
}

addDelta(delta) {
    this.deltas.push(delta); 
}

setPolars(polars) {
    this.polars = polars; 
}

addPolar(polar) {
    this.polars.push(polar);
}

setTables(tables) {
    this.tables = tables; 
}

addTable(table) {
    this.tables.push(table);
}

setAttitudes(attitudes) {
    this.attitudes = attitudes; 
}

addAttitude(attitude) {
    this.attitudes.push(attitude); 
}

report() {
   const report = {};
     if (this.deltas) report.deltas = this.deltas.map(delta =>
         (delta && typeof delta.report === 'function') ? delta.report() : JSON.stringify(delta)
     );
     if (this.polars) report.polars = this.polars.map(polar =>
         (polar && typeof polar.report === 'function') ? polar.report() : JSON.stringify(polar)
     );
     if (this.tables) report.tables = this.tables.map(table =>
         (table && typeof table.report === 'function') ? table.report() : JSON.stringify(table)
     );
     if (this.attitudes) report.attitudes = this.attitudes.map(attitude =>
         (attitude && typeof attitude.report === 'function') ? attitude.report() : JSON.stringify(attitude)
     );
   return report;
}


toJSON() {
    return {
        deltas: this.deltas ? this.deltas.map(delta => delta.toJSON()) : [],
        polars: this.polars ? this.polars.map(polar => polar.toJSON()) : [],
        tables: this.tables ? this.tables.map(table => table.toJSON()) : [],
        attitudes: this.attitudes ? this.attitudes.map(attitude => attitude.toJSON()) : []
    };
}
}

module.exports = Reporter;
