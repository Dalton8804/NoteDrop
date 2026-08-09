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
    newNoteEl.id = id;

    // textContent, not innerHTML — note text is untrusted, and with
    // integrations on it round-trips through external tools.
    const textEl = document.createElement("span");
    textEl.className = "noteText";
    textEl.textContent = noteList[id];

    // Deletes propagate to integrations, so removal needs a deliberate
    // target rather than a click anywhere on the row.
    const deleteEl = document.createElement("button");
    deleteEl.className = "noteDelete";
    deleteEl.textContent = "✕";
    deleteEl.title = "Delete note";
    deleteEl.addEventListener('click', (_) => removeNote(newNoteEl));

    newNoteEl.appendChild(textEl);
    newNoteEl.appendChild(deleteEl);

    if (i % 2 === 0) {
      newNoteEl.style.background = '';
    } else {
      newNoteEl.style.background = '#585858';
    }

    noteListEl.appendChild(newNoteEl);
  }
}

window.data.onRefresh(loadNotes);

loadNotes();
