import { describe, expect, it } from "vitest";
import {
  cycleDay, endsToClear, fmtDate, observedLength, parseDate, periodStartFor,
  phaseForDate, phaseForDay, referenceAfterRemoval, toggleFlow, type CycleSettings,
} from "./cycle";

const s28: CycleSettings = { last_period_start: "2026-12-28", cycle_length: 28, period_length: 5 };

describe("datas", () => {
  it("parseDate/fmtDate fazem ida e volta, inclusive virada de ano", () => {
    expect(fmtDate(parseDate("2026-12-31"))).toBe("2026-12-31");
    expect(fmtDate(parseDate("2027-01-01"))).toBe("2027-01-01");
  });
});

describe("cycleDay", () => {
  it("retorna null sem início registrado", () => {
    expect(cycleDay(new Date(2027, 0, 1), { ...s28, last_period_start: null })).toBeNull();
    expect(phaseForDate(new Date(2027, 0, 1), { ...s28, last_period_start: null })).toBeNull();
  });
  it("o dia de início é o dia 1", () => {
    expect(cycleDay(new Date(2026, 11, 28), s28)).toBe(1);
  });
  it("atravessa a virada de ano", () => {
    expect(cycleDay(new Date(2027, 0, 1), s28)).toBe(5);
  });
  it("reinicia após cycle_length dias", () => {
    expect(cycleDay(new Date(2027, 0, 25), s28)).toBe(1);
  });
  it("datas anteriores ao início contam para trás no ciclo", () => {
    expect(cycleDay(new Date(2026, 11, 27), s28)).toBe(28);
  });
});

describe("phaseForDay (ciclo de 28, menstruação de 5)", () => {
  it.each([
    [1, "menstrual"], [5, "menstrual"], [6, "folicular"], [12, "folicular"],
    [13, "ovulatoria"], [14, "ovulatoria"], [15, "ovulatoria"], [16, "lutea"], [28, "lutea"],
  ])("dia %i → %s", (d, p) => expect(phaseForDay(d, s28)).toBe(p));

  it("ciclo irregular de 35 dias desloca a ovulação para o dia 21", () => {
    const s35 = { ...s28, cycle_length: 35 };
    expect(phaseForDay(19, s35)).toBe("folicular");
    expect(phaseForDay(20, s35)).toBe("ovulatoria");
    expect(phaseForDay(23, s35)).toBe("lutea");
  });
});

describe("registros de menstruação", () => {
  it("referenceAfterRemoval mantém referência não removida", () => {
    expect(referenceAfterRemoval("2027-01-10", "2026-12-10", ["2026-12-10", "2027-01-10"])).toBe("2027-01-10");
  });
  it("referenceAfterRemoval cai para o início mais recente restante", () => {
    expect(referenceAfterRemoval("2027-01-10", "2027-01-10", ["2026-11-12", "2026-12-10", "2027-01-10"])).toBe("2026-12-10");
  });
  it("referenceAfterRemoval retorna null quando não sobra início", () => {
    expect(referenceAfterRemoval("2027-01-10", "2027-01-10", ["2027-01-10"])).toBeNull();
  });
  it("toggleFlow seleciona e desmarca", () => {
    expect(toggleFlow(null, "Leve")).toBe("Leve");
    expect(toggleFlow("Leve", "Leve")).toBeNull();
    expect(toggleFlow("Leve", "Intenso")).toBe("Intenso");
  });
  it("periodStartFor pega o início mais recente até a data", () => {
    const starts = ["2026-12-28", "2026-11-30", "2027-01-25"];
    expect(periodStartFor("2027-01-02", starts)).toBe("2026-12-28");
    expect(periodStartFor("2026-11-01", starts)).toBeNull();
  });
  it("endsToClear limita ao período atual", () => {
    const starts = ["2026-12-28", "2027-01-25"];
    const ends = ["2026-12-31", "2027-01-02", "2027-01-28"];
    expect(endsToClear("2026-12-28", "2027-01-02", starts, ends)).toEqual(["2026-12-31"]);
  });
  it("observedLength conta início e fim e respeita fevereiro bissexto", () => {
    expect(observedLength("2026-12-30", "2027-01-02")).toBe(4);
    expect(observedLength("2028-02-27", "2028-03-01")).toBe(4);
    expect(observedLength("2027-02-27", "2027-03-01")).toBe(3);
  });
});
