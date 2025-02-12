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

  const id = self.crypto.randomUUID();
  noteList[id] = newNoteText;
  window.data.save(id, newNoteText);

  newNoteTextField.value = '';
  renderNotes();
}

function removeNote(El: HTMLLIElement) {
  delete noteList[El.id];
  El.remove();
  renderNotes();
  window.data.delete(El.id);
}

function loadNotes() {
    window.data.getAll().then((data) => {
        noteList = JSON.parse(data);
        renderNotes();
    });
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

loadNotes();
