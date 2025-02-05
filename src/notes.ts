const PATH = "~/.notedrop";

const newNoteTextField = (<HTMLInputElement>document.getElementById("nntf"));
newNoteTextField.addEventListener("keydown", function(e) {
  if (e.code == "Enter")
    addNote();
})

const noteListEl = (<HTMLUListElement>document.getElementById("nl"));

var noteList: Record<string, string> = {};

function addNote() {
  const newNoteText = newNoteTextField.value;
  if (!newNoteText.trim())
    return

  noteList[self.crypto.randomUUID()] = newNoteText;

  newNoteTextField.value = '';
  renderNotes();
  writeToSaveFile()
}

function removeNote(El: HTMLLIElement) {
  delete noteList[El.id];
  El.remove();
  renderNotes();
  writeToSaveFile()
}

function renderNotes() {
  noteListEl.innerHTML = '';
  for (let i=0; i<Object.keys(noteList).length; ++i) {
    const id = Object.keys(noteList)[i];
    const newNoteEl = document.createElement("li");
    newNoteEl.innerHTML = noteList[id];
    newNoteEl.id = id;
    newNoteEl.addEventListener('click', (_) => removeNote(newNoteEl));
    if (i % 2 === 0) {
      newNoteEl.style.background = '';
    } else {
      newNoteEl.style.background = '#585858';
    }
    noteListEl.appendChild(newNoteEl);
  }
}

function writeToSaveFile() {
  var buffer: string = "";
  for (let i = 0; i < Object.keys(noteList).length; ++i) {
    const key = Object.keys(noteList)[i];
    buffer += key + '\n=\n' + noteList[key] + '\n\n\n';
  }

  window.electronAPI.saveUserData(PATH, buffer);
}

function loadNotesFromSaveFile() {
  window.electronAPI.readUserData(PATH).then((data: string) => {
    if (data == null) {
      console.log("Data null");
      return;
    }
    var noteStrs = data.toString().split('\n\n\n');
    noteStrs = noteStrs.slice(0, noteStrs.length-1);
    for (let i = 0; i < noteStrs.length; ++i) {
      var noteParts = noteStrs[i].split('\n=\n');
      noteList[noteParts[0]] = noteParts[1];
    }
    renderNotes();
  })
}

loadNotesFromSaveFile();