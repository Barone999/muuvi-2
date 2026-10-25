import { describe, expect, it } from "vitest";
import {
  PROGRAM, LIGHT_WALK_WEEK, buildIntervals, describeWeek, isPregnancyWeek, isWorkoutComplete,
  minSecondsToComplete, pregnancyWeek, programProgress, totalMinutes,
} from "./program";

describe("estrutura do programa", () => {
  it("tem 8 semanas em ordem", () => {
    expect(PROGRAM.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("o tempo de corrida nunca diminui entre semanas", () => {
    for (let i = 1; i < PROGRAM.length; i++) expect(PROGRAM[i]!.run).toBeGreaterThanOrEqual(PROGRAM[i - 1]!.run);
  });
});

describe("buildIntervals", () => {
  it("semana 1: aquecimento, 8x (corre 1 / caminha 2), desaquecimento", () => {
    const iv = buildIntervals(1);
    expect(iv).toHaveLength(18);
    expect(iv[0]).toEqual({ kind: "warmup", seconds: 300 });
    expect(iv[1]).toEqual({ kind: "run", seconds: 60 });
    expect(iv[2]).toEqual({ kind: "walk", seconds: 120 });
    expect(iv[17]).toEqual({ kind: "cooldown", seconds: 300 });
  });
  it("durações totais por semana", () => {
    expect(totalMinutes(1)).toBe(34);
    expect(totalMinutes(2)).toBe(35);
    expect(totalMinutes(8)).toBe(46);
  });
  it("caminhada leve: 20 minutos contínuos", () => {
    expect(buildIntervals(LIGHT_WALK_WEEK)).toEqual([{ kind: "walk", seconds: 1200 }]);
  });
  it("gestação: semanas 101–103", () => {
    expect(pregnancyWeek(1)).toBe(101);
    expect(isPregnancyWeek(100)).toBe(false);
    expect(isPregnancyWeek(103)).toBe(true);
    expect(isPregnancyWeek(104)).toBe(false);
    expect(totalMinutes(101)).toBe(24);
    expect(buildIntervals(102).filter((i) => i.kind === "hydrate")).toHaveLength(3);
  });
  it("semana desconhecida usa a semana 1", () => {
    expect(buildIntervals(99)).toEqual(buildIntervals(1));
  });
  it("describeWeek formata meio minuto com vírgula", () => {
    expect(describeWeek(2)).toBe("1,5 min correndo + 2 min caminhando, 7x");
  });
});

describe("conclusão do treino", () => {
  it("pode pular o desaquecimento", () => {
    expect(minSecondsToComplete(1)).toBe(34 * 60 - 300);
    expect(isWorkoutComplete(1, 1739)).toBe(false);
    expect(isWorkoutComplete(1, 1740)).toBe(true);
  });
  it("sem desaquecimento exige 80%", () => {
    expect(minSecondsToComplete(LIGHT_WALK_WEEK)).toBe(960);
  });
});

describe("programProgress", () => {
  it("início: semana 1, sessão 1, semana 2 bloqueada", () => {
    const r = programProgress([], 3);
    expect(r.current.week).toBe(1);
    expect(r.nextSession).toBe(1);
    expect(r.weeks[1]!.unlocked).toBe(false);
  });
  it("concluir a meta semanal desbloqueia a próxima", () => {
    const r = programProgress([1, 2, 3].map((session) => ({ week: 1, session })), 3);
    expect(r.weeks[0]!.finished).toBe(true);
    expect(r.current.week).toBe(2);
  });
  it("próxima sessão preenche a lacuna", () => {
    expect(programProgress([{ week: 1, session: 1 }, { week: 1, session: 3 }], 3).nextSession).toBe(2);
  });
  it("aumentar a meta não rebloqueia semanas já alcançadas", () => {
    const done = [1, 2, 3].map((session) => ({ week: 1, session })).concat({ week: 2, session: 1 });
    expect(programProgress(done, 4).weeks[1]!.unlocked).toBe(true);
  });
  it("completed é limitado à meta semanal", () => {
    const done = [1, 2, 3, 4].map((session) => ({ week: 1, session }));
    expect(programProgress(done, 3).weeks[0]!.completed).toBe(3);
  });
});
