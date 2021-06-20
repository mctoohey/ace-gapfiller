var editor = ace.edit("editor");
editor.session.setMode("ace/mode/python");
var Range = ace.require("ace/range").Range;


// Define area of gaps.
var gaps_old = [
    {
        startLine: 2,
        startCol: 13,
        endLine: 2,
        endCol: 17,

        minWidth: 4,
        maxWidth: 10,
        text:""
    },
    {
        startLine: 3,
        startCol: 27,
        endLine: 3,
        endCol: 37,

        minWidth: 10,
        maxWidth: 15,
        text:""
    }
]

var gaps = [
    {
        range: new Range(2, 13, 2, 17),

        minWidth: 4,
        maxWidth: 10,
        text:"",
        textSize: 0
    },
    {
        range: new Range(3, 27, 3, 37),

        minWidth: 10,
        maxWidth: 15,
        text:"",
        textSize: 0
    },
    {
        range: new Range(3, 4, 3, 9),

        minWidth: 5,
        maxWidth: 10,
        text:"",
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

// Add highlight the gaps.
for (var i = 0; i < gaps.length; i++) {
    var gap = gaps[i];
    editor.session.addMarker(gap.range, "ace-gap-outline", "text", false);
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
        if (gap != null && commandName === "gotoright") {
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
                    gap.range.end.column += 1;
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
                    gap.range.end.column -= 1;  // Shrink the size of the gap.
                } else {
                    editor.session.insert({row: cursor.row, column: gap.range.end.column-1}, fillChar);   // Put new space at end so everything is shifted across.
                }
            }
        } else if (commandName === "del") {
            if (cursor.column < gap.range.end.column && gap.textSize > 0) {
                gap.textSize -= 1;
                editor.session.remove(new Range(cursor.row, cursor.column, cursor.row, cursor.column+1));

                if (gap.textSize >= gap.minWidth) {
                    gap.range.end.column -= 1;  // Shrink the size of the gap.
                } else {
                    editor.session.insert({row: cursor.row, column: gap.range.end.column-1}, fillChar); // Put new space at end so everything is shifted across.
                }
            }
        }
        editor.selection.clearSelection(); // Keep selection clear.
    }
    e.preventDefault();
    e.stopPropagation();
    return;

    if (commandName.startsWith("go")) {  // If command just moves the cursor then do nothing.
        return;
    } else {
        // Back space is a bit of a special case because it modifies the character before the cursor.
        if (commandName === "backspace") {
            cursor.column -= 1;
        }
        var shouldPreventDefault = true;
        for (var i = 0; i < gaps.length; i++) {
            // var gap = gaps[i];

            if (!editor.selection.isEmpty() && (!cursorInGap(selectionRange.start, gap) || !cursorInGap(selectionRange.end, gap))) {
                continue;
            }

            // TODO: write code that finds the nearest gap. Could later be upgraded with a binary search.
            if (cursorInGap({row: cursor.row, column: cursor.column}, gap)) {
                if (commandName === "backspace") { // If we get a backspace command then we insert the 'fillChar'.
                    editor.session.remove(new Range(cursor.row, cursor.column, cursor.row, cursor.column+1));
                    editor.session.insert({row: cursor.row, column: gap.range.end.column-1}, fillChar);   // Put new space at end so everything is shifted across.
                    editor.moveCursorTo(cursor.row, cursor.column);
                    if (!editor.selection.isEmpty()) {
                        editor.moveCursorTo(selectionRange.start.row, selectionRange.start.column);
                        editor.selection.clearSelection();
                    }
                    
                } else if (commandName === "del") {
                    editor.session.insert({row: cursor.row, column: cursor.column+1}, fillChar);
                    shouldPreventDefault = false;
                } else if (commandName === "insertstring") {    // Otherwise remove a 'fillChar' and fill in the gap with whatever char the user pressed.
                    if (validChars.test(e.args)) {
                        if (editor.selection.isEmpty()) {
                            shouldPreventDefault = false;
                            if (gap.text.length == (gap.range.end.column-gap.range.start.column) && (gap.range.end.column-gap.range.start.column) < gap.maxWidth) {
                                gap.range.end.column += 1;
                            } else if (gap.text.length < gap.maxWidth) {
                                // console.log(gap.text)
                                editor.session.remove(new Range(cursor.row, gap.range.end.column-1, cursor.row, gap.range.end.column));
                            } else {
                                shouldPreventDefault = true;
                            }
                            
                        } else {
                            editor.session.remove(new Range(cursor.row, selectionRange.start.column, cursor.row, selectionRange.start.column+e.args.length));
                            editor.session.insert(selectionRange.start, e.args);
                            editor.moveCursorTo(selectionRange.start.row, selectionRange.start.column+1);
                            editor.selection.clearSelection();
                        }
                    }
                }
                
            }
        }

        if (shouldPreventDefault) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
});

// editor.session.on('change', function(delta) {
// // Update text that the gap stores.
// for (var i = 0; i < gaps.length; i++) {
//     gap = gaps[i];
//     gap.text = editor.session.doc.getTextRange(gap.range).trimRight();
//     if (gap.text.length < gap.minWidth) {
//         gap.range.end.column = gap.range.start.column + gap.minWidth;
//     } else if (gap.text.length >= gap.maxWidth) {
//         gap.range.end.column = gap.range.start.column + gap.maxWidth;
//     } else {
//         gap.range.end.column = gap.range.start.column + gap.text.length;
//     }
// }
    
// });

// Move cursor to where it should be if we click on a gap.
editor.selection.on('changeCursor', function() {
    var cursor = editor.selection.getCursor();
    let gap = findCursorGap(cursor);
    if (gap != null) {
        if (cursor.column > gap.range.start.column+gap.textSize) {
            editor.moveCursorTo(gap.range.start.row, gap.range.start.column+gap.textSize);
        }
    }
});