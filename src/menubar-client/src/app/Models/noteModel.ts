export class Note {
  title: string;
  body: string;
  timestamp: Date;

  constructor(title: string, timestamp: Date) {
    this.title = title;
    this.body = '';
    this.timestamp = timestamp;
  }
}
