import { describe, expect, it } from 'vitest';
import { STATEMENT_FILE_ACCEPT, statementFormatForFiles } from './statementFormat';

function file(name: string): File {
  return new File(['x'], name, { type: 'application/octet-stream' });
}

describe('statementFormatForFiles', () => {
  it('maps a .csv selection to csv', () => {
    expect(statementFormatForFiles([file('statement.csv')])).toEqual({ format: 'csv' });
  });

  it('maps a .xlsx selection to xlsx', () => {
    expect(statementFormatForFiles([file('stmts_123.xlsx')])).toEqual({ format: 'xlsx' });
  });

  it('is case-insensitive on the extension', () => {
    expect(statementFormatForFiles([file('A.CSV')])).toEqual({ format: 'csv' });
    expect(statementFormatForFiles([file('B.XLSX')])).toEqual({ format: 'xlsx' });
  });

  it('accepts multiple files of the same format', () => {
    expect(statementFormatForFiles([file('jan.csv'), file('feb.csv')])).toEqual({ format: 'csv' });
  });

  it('rejects a mixed .csv + .xlsx selection', () => {
    const result = statementFormatForFiles([file('a.csv'), file('b.xlsx')]);
    expect(result).toHaveProperty('error');
  });

  it('rejects an unrecognized extension', () => {
    expect(statementFormatForFiles([file('notes.txt')])).toHaveProperty('error');
  });

  it('rejects an empty selection', () => {
    expect(statementFormatForFiles([])).toHaveProperty('error');
  });

  it('exposes an accept string covering csv and xlsx', () => {
    expect(STATEMENT_FILE_ACCEPT).toContain('.csv');
    expect(STATEMENT_FILE_ACCEPT).toContain('.xlsx');
  });
});
