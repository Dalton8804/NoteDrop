import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { Note } from './Models/noteModel';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent {
  title = 'notebar-ui';

  @ViewChild('newNoteInput', {static: false}) newNoteInput?: ElementRef;


  notesList: Note[] = [];
  newNoteTitle: string = '';

  addNewNote() {
    const newNote = new Note(this.newNoteTitle, new Date());
    this.notesList.push(newNote);
    this.newNoteTitle = '';
  }

  removeNote(note: Note) {
    this.notesList = this.notesList.filter(el => { return el !== note });
  }

  focusInput() {
    if(this.newNoteInput)
      this.newNoteInput.nativeElement.focus();
  }

}
