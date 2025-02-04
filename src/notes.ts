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

  const newNoteEl = document.createElement("li");
  newNoteEl.innerHTML = newNoteText;
  newNoteEl.id = self.crypto.randomUUID();
  newNoteEl.addEventListener('click', (_) => removeNote(newNoteEl));

  noteListEl.appendChild(newNoteEl);
  noteList[newNoteEl.id] = newNoteText;

  newNoteTextField.value = '';
  alternateBackgrounds();
}

function removeNote(El: HTMLLIElement) {
  delete noteList[El.id];
  El.remove();
  alternateBackgrounds();
}

function alternateBackgrounds() {
  for (let i = 0; i < Object.keys(noteList).length; ++i) {
    const el = document.getElementById(Object.keys(noteList)[i]);
    if (i % 2 === 0) {
      el.style.background = '';
    } else {
      el.style.background = '#585858';
    }
  }
}
