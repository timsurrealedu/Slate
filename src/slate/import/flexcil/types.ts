export interface SeekableSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}
export class FlexcilImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FlexcilImportError";
  }
}
export class FlexcilImportCancelledError extends FlexcilImportError {
  constructor() {
    super("cancelled", "Flexcil import was cancelled.");
  }
}
