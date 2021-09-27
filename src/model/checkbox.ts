import {Position} from 'vscode';

export default class Checkbox {
  checked: boolean = false;
  position: Position | null = null;
  label: string = '';
  text: string = '';
  lineNumber: number = 0;
  value: object | null = null;
  coding_records: number = 0;
}
