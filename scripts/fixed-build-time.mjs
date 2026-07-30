const fixedIso = process.env.SOURCE_DATE_EPOCH || "2026-07-30T00:00:00.000Z";
const fixedTime = new globalThis.Date(fixedIso).getTime();
if (!Number.isFinite(fixedTime)) throw new Error(`SOURCE_DATE_EPOCH inválido: ${fixedIso}`);

const NativeDate = globalThis.Date;
class ReproducibleDate extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [fixedTime]));
  }
  static now() {
    return fixedTime;
  }
}

Object.setPrototypeOf(ReproducibleDate, NativeDate);
globalThis.Date = ReproducibleDate;
