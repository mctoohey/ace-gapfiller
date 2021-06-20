var editor = ace.edit("editor");
editor.session.setMode("ace/mode/python");
const Range = ace.require("ace/range").Range;


// Define area of gaps.
var gaps = [
    {
        range: new Range(2, 13, 2, 17),

        minWidth: 4,
        maxWidth: 10,
        textSize: 0
    },
    {
        range: new Range(3, 27, 3, 37),

        minWidth: 10,
        maxWidth: 15,
        textSize: 0
    },
    {
        range: new Range(3, 4, 3, 9),

        minWidth: 5,
        maxWidth: 10,
        textSize: 0
    }
]

const fillChar = " ";
const validChars = /[ !"#$%&'()*+`\-./0-9:;<=>?@A-Z\[\]\\^_a-z{}|~]/

// Return if cursor in gap (including end of the gap).
function cursorInGap(cursor, gap) {
    return (cursor.row >= gap.range.start.row && cursor.column >= gap.range.start.column  && 
            cursor.row <= gap.range.end.row && cursor.column <= gap.range.end.column);
}

function gapWidth(gap) {
    return (gap.range.end.column-gap.range.start.column);
}

// Return the gap that the cursor is in. This will acutally return a gap if the cursor is 1 outside the gap
// as this will be needed for backspace/insertion to work. Rigth now this is done as a simple
// linear search but could be improved later. Returns null if the cursor is not in a gap.
function findCursorGap(cursor) {
    for (let gap of gaps) {
        if (cursorInGap(cursor, gap)) {
            return gap;
        }
    }
    return null;
}

function changeGapWidth(gap, delta) {
    gap.range.end.column += delta;

    // Update any gaps that come after this one on the same line.
    for (let other of gaps) {
        if (other.range.start.row === gap.range.start.row && other.range.start.column > gap.range.end.column) {
            other.range.start.column += delta;
            other.range.end.column += delta;
        }
    }

    editor.$onChangeBackMarker();
    editor.$onChangeFrontMarker();
}

// Add highlight the gaps.
for (let gap of gaps) {
    editor.session.addMarker(gap.range, "ace-gap-outline", "text", true);
    editor.session.addMarker(gap.range, "ace-gap-background", "text", false);
}

// Intercept commands sent to ace.
editor.commands.on("exec", function(e) { 
    let cursor = editor.selection.getCursor();
    let commandName = e.command.name;
    selectionRange = editor.getSelectionRange();

    // console.log(selectionRange);
    // console.log(e);
    // console.log(cursor)

    let gap = findCursorGap(cursor);

    if (commandName.startsWith("go")) {  // If command just moves the cursor then do nothing.
        if (gap != null && commandName === "gotoright" && cursor.column === gap.range.start.column+gap.textSize) {
            // In this case we jump out of gap over the empty space that contains nothing that the user has entered.
            editor.moveCursorTo(cursor.row, gap.range.end.column+1);
        } else {
            return;
        }   
    }

    if (gap === null) {
        // Not in a gap

    } else if (editor.selection.isEmpty()) {
        // User is not selecting multiple characters.
        if (commandName === "insertstring") {
            let char = e.args;
            if (validChars.test(char)) {
                if (gap.textSize == gapWidth(gap) && gapWidth(gap) < gap.maxWidth) {    // Grow the size of gap and insert char.
                    changeGapWidth(gap, 1);
                    gap.textSize += 1;  // Important to record that texSize has increased before insertion.
                    editor.session.insert(cursor, char);
                } else if (gap.textSize < gap.maxWidth) {   // Insert char.
                    editor.session.remove(new Range(cursor.row, gap.range.end.column-1, cursor.row, gap.range.end.column));
                    gap.textSize += 1;  // Important to record that texSize has increased before insertion.
                    editor.session.insert(cursor, char);
                }
            }
        } else if (commandName === "backspace") {
            if (cursor.column > gap.range.start.column && gap.textSize > 0) {
                gap.textSize -= 1;
                editor.session.remove(new Range(cursor.row, cursor.column-1, cursor.row, cursor.column));
                editor.moveCursorTo(cursor.row, cursor.column-1);

                if (gap.textSize >= gap.minWidth) {     
                    changeGapWidth(gap, -1);  // Shrink the size of the gap.
                } else {
                    editor.session.insert({row: cursor.row, column: gap.range.end.column-1}, fillChar);   // Put new space at end so everything is shifted across.
                }
            }
        } else if (commandName === "del") {
            if (cursor.column < gap.range.end.column && gap.textSize > 0) {
                gap.textSize -= 1;
                editor.session.remove(new Range(cursor.row, cursor.column, cursor.row, cursor.column+1));

                if (gap.textSize >= gap.minWidth) {
                    changeGapWidth(gap, -1);  // Shrink the size of the gap.
                } else {
                    editor.session.insert({row: cursor.row, column: gap.range.end.column-1}, fillChar); // Put new space at end so everything is shifted across.
                }
            }
        }
        editor.selection.clearSelection(); // Keep selection clear.
    }
    e.preventDefault();
    e.stopPropagation();    
});

// Move cursor to where it should be if we click on a gap.
editor.selection.on('changeCursor', function() {
    let cursor = editor.selection.getCursor();
    let gap = findCursorGap(cursor);
    if (gap != null) {
        if (cursor.column > gap.range.start.column+gap.textSize) {
            editor.moveCursorTo(gap.range.start.row, gap.range.start.column+gap.textSize);
        }
    }
});