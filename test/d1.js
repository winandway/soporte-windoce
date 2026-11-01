// Imitación mínima de la base de YaDominios (D1) sobre el SQLite que trae Node, para probar sin red.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function baseDePrueba() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const preparar = (sql) => {
    let params = [];
    const st = {
      bind: (...p) => {
        params = p;
        return st;
      },
      first: async () => sqlite.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
      run: async () => sqlite.prepare(sql).run(...params),
      _ejecutar: () => sqlite.prepare(sql).run(...params),
    };
    return st;
  };
  return {
    sqlite,
    prepare: preparar,
    batch: async (sentencias) => {
      sqlite.exec("BEGIN");
      try {
        for (const s of sentencias) s._ejecutar();
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
