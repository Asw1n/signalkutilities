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

_toKeyed(items, accessor) {
  const result = {};
  for (const item of items) {
    if (item && item.id != null) {
      result[item.id] = accessor(item);
    }
  }
  return result;
}

report() {
  const result = {};
  if (this.deltas) result.deltas = this._toKeyed(this.deltas, d => typeof d.report === 'function' ? d.report() : JSON.stringify(d));
  if (this.polars) result.polars = this._toKeyed(this.polars, p => typeof p.report === 'function' ? p.report() : JSON.stringify(p));
  if (this.tables) result.tables = this._toKeyed(this.tables, t => typeof t.report === 'function' ? t.report() : JSON.stringify(t));
  if (this.attitudes) result.attitudes = this._toKeyed(this.attitudes, a => typeof a.report === 'function' ? a.report() : JSON.stringify(a));
  return result;
}

meta() {
  const result = {};
  if (this.deltas) result.deltas = this._toKeyed(this.deltas, d => d.meta ?? null);
  if (this.polars) result.polars = this._toKeyed(this.polars, p => p.meta ?? null);
  if (this.tables) result.tables = this._toKeyed(this.tables, t => t.meta ?? null);
  if (this.attitudes) result.attitudes = this._toKeyed(this.attitudes, a => a.meta ?? null);
  return result;
}

state() {
  const result = {};
  if (this.deltas) result.deltas = this._toKeyed(this.deltas, d => d.state ?? null);
  if (this.polars) result.polars = this._toKeyed(this.polars, p => p.state ?? null);
  if (this.tables) result.tables = this._toKeyed(this.tables, t => t.state ?? null);
  if (this.attitudes) result.attitudes = this._toKeyed(this.attitudes, a => a.state ?? null);
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
