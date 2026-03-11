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

meta() {
  const result = {};
  if (this.deltas) result.deltas = this.deltas.map(d => (d && typeof d.meta !== 'undefined') ? d.meta : null);
  if (this.polars) result.polars = this.polars.map(p => (p && typeof p.meta !== 'undefined') ? p.meta : null);
  if (this.tables) result.tables = this.tables.map(t => (t && typeof t.meta !== 'undefined') ? t.meta : null);
  if (this.attitudes) result.attitudes = this.attitudes.map(a => (a && typeof a.meta !== 'undefined') ? a.meta : null);
  return result;
}

state() {
  const result = {};
  if (this.deltas) result.deltas = this.deltas.map(d => (d && typeof d.state !== 'undefined') ? d.state : null);
  if (this.polars) result.polars = this.polars.map(p => (p && typeof p.state !== 'undefined') ? p.state : null);
  if (this.tables) result.tables = this.tables.map(t => (t && typeof t.state !== 'undefined') ? t.state : null);
  if (this.attitudes) result.attitudes = this.attitudes.map(a => (a && typeof a.state !== 'undefined') ? a.state : null);
  return result;
}


toJSON() {
  return {
    deltas: this.deltas ? this.deltas.map(delta => (delta && typeof delta.toJSON === 'function') ? delta.toJSON() : delta) : [],
    polars: this.polars ? this.polars.map(polar => (polar && typeof polar.toJSON === 'function') ? polar.toJSON() : polar) : [],
    tables: this.tables ? this.tables.map(table => (table && typeof table.toJSON === 'function') ? table.toJSON() : table) : [],
    attitudes: this.attitudes ? this.attitudes.map(attitude => (attitude && typeof attitude.toJSON === 'function') ? attitude.toJSON() : attitude) : []
  };
}
}

module.exports = Reporter;
