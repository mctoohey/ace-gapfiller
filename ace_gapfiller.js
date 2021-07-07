// Script for creating  ace editor with gaps to fill in.

var editor = ace.edit("editor");
editor.session.setMode("ace/mode/python");
editor.setFontSize(26)
const Range = ace.require("ace/range").Range;
const fillChar = " ";
const validChars = /[ !"#$%&'()*+`\-./0-9:;<=>?@A-Z\[\]\\^_a-z{}|~]/

function gapWidth(gap) {
    return (gap.range.end.column-gap.range.start.column);
}

// Return the gap that the cursor is in. This will acutally return a gap if the cursor is 1 outside the gap
// as this will be needed for backspace/insertion to work. Rigth now this is done as a simple
// linear search but could be improved later. Returns null if the cursor is not in a gap.
function findCursorGap(cursor) {
    for (let gap of gaps) {
        if (gap.cursorInGap(cursor)) {
            return gap;
        }
    }
    return null;
}

function Gap(editor, row, column, minWidth, maxWidth=Infinity) {
    this.editor = editor;

    this.minWidth = minWidth;
    this.maxWidth = maxWidth;

    this.range = new Range(row, column, row, column+minWidth);
    this.textSize = 0;

    // Create markers
    this.editor.session.addMarker(this.range, "ace-gap-outline", "text", true);
    this.editor.session.addMarker(this.range, "ace-gap-background", "text", false);
}

Gap.prototype.cursorInGap = function(cursor) {
    return (cursor.row >= this.range.start.row && cursor.column >= this.range.start.column  && 
        cursor.row <= this.range.end.row && cursor.column <= this.range.end.column);
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

let gaps = [];
// Extract gaps from source code and insert gaps into editor.
function reEscape(s) {
    var c, specials = '{[(*+\\', result='';
    for (var i = 0; i < s.length; i++) {
        c = s[i];
        for (var j = 0; j < specials.length; j++) {
            if (c === specials[j]) {
                c = '\\' + c;
            }
        }
        result += c;
    }
    return result;
}

let code = editor.session.getValue();
let lines = code.split(/\r?\n/);

let sepLeft = reEscape('{[');
let sepRight = reEscape(']}');
let splitter = new RegExp(sepLeft + ' *((?:\\d+)|(?:\\d+- *\\d+)) *' + sepRight);

let result = "";
for (let i = 0; i < lines.length; i++) {
    let bits = lines[i].split(splitter);
    result += bits[0];
    
    let columnPos = bits[0].length;
    for (let j = 1; j < bits.length; j += 2) {
        let values = bits[j].split('-');
        let minWidth = parseInt(values[0]);
        let maxWidth = (values.length > 1 ? parseInt(values[1]) : Infinity);
    
        // Create new gap.
        gaps.push(new Gap(editor, i, columnPos, minWidth, maxWidth));
        columnPos += minWidth;
        result += ' '.repeat(minWidth);
        if (j + 1 < bits.length) {
            result += bits[j+1];
            columnPos += bits[j+1].length;
        }
        
    }

    if (i < lines.length-1) {
        result += '\n';
    }
}

editor.session.setValue(result);


// Add highlight the gaps.
// for (let gap of gaps) {
//     editor.session.addMarker(gap.range, "ace-gap-outline", "text", true);
//     editor.session.addMarker(gap.range, "ace-gap-background", "text", false);
// }

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
            if (cursor.column < gap.range.start.column + gap.textSize && gap.textSize > 0) {
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