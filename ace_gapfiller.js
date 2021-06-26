var editor = ace.edit("editor");
editor.session.setMode("ace/mode/python");
editor.setFontSize(26)
const Range = ace.require("ace/range").Range;
const fillChar = ".";
const validChars = /[ !"#$%&'()*+`\-./0-9:;<=>?@A-Z\[\]\\^_a-z{}|~]/

// Return if cursor in gap (including end of the gap).
function cursorInGap(cursor, gap) {
    return (cursor.row >= gap.range.start.row && cursor.column >= gap.range.start.column  && 
            cursor.row < gap.range.end.row && cursor.column <= gap.range.end.column);
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

function Gap(editor, row, column, minWidth, maxWidth=Infinity, minHeight=1, maxHeight=1) {
    this.editor = editor;

    this.minWidth = minWidth;
    this.maxWidth = maxWidth;
    this.minHeight = minHeight;
    this.maxHeight = maxHeight;

    this.range = new Range(row, column, row+minHeight, column+minWidth);
    this.isMultiline = maxHeight > 1;

    this.lineSizes = Array(minHeight).fill(0);

    this.markerRanges = [];
    this.markerIds = [];
    for (let i=0; i < minHeight; i++) {
        let markerRange = new Range(row+i, column, row+i, column+minWidth);       
        this.markerRanges.push(markerRange);
    }
    this.updateMarkerCSS();

    // Store all insertions that need to be made when the gap is updated.
    this.insertions = [];
}

Gap.prototype.calculateLineSize = function(row) {
    return this.lineSizes[row-this.range.start.row];
}

Gap.prototype.updateMarkerCSS = function() {
    for (let id of this.markerIds) {
        this.editor.session.removeMarker(id);
    }

    for (let i=0; i < this.markerRanges.length; i++) {
        let markerRange = this.markerRanges[i];
        this.markerIds.push(this.editor.session.addMarker(markerRange, "ace-gap-background", "text", false));
        this.markerIds.push(this.editor.session.addMarker(markerRange, "ace-gap-border-sides", "text", true));
        
        if (i === 0) {
            this.markerIds.push(this.editor.session.addMarker(markerRange, "ace-gap-border-top", "text", true));
        } 
        
        if (i === this.markerRanges.length-1) {
            this.markerIds.push(this.editor.session.addMarker(markerRange, "ace-gap-border-bottom", "text", true));
        } 
    }
}

Gap.prototype.updateLineSize = function(row, delta) {
    this.lineSizes[row-this.range.start.row] += delta;
    let newWidth = Math.max(this.minWidth, ...this.lineSizes);
    if (newWidth !== (this.range.end.column-this.range.start.column)) {
        this.setWidth(newWidth);
    }
}

Gap.prototype.updateMarkerRanges = function() {
    let row = this.range.start.row;
    console.log(row)
    for (let markerRange of this.markerRanges) {
        markerRange.start.row = row;
        markerRange.end.row = row;
        markerRange.start.column = this.range.start.column;
        markerRange.end.column = this.range.end.column;
        row += 1;
        console.log(row)
    }
}

Gap.prototype.getWidth = function() {
    return this.range.end.column-this.range.start.column;
}

Gap.prototype.insertLine = function(cursor) {
    if (this.range.end.row - this.range.start.row < this.maxHeight) {
        if (cursor.row === this.range.end.row-1 || this.calculateLineSize(cursor.row+1) > 0) {
            this.editor.session.insert({row: cursor.row+1, column: 0}, fillChar.repeat(this.range.end.column)+'\n');  // Add new line
            let markerRange = new Range(this.range.end.row, this.range.start.column, this.range.end.row, this.range.end.column);
            this.markerRanges.splice(cursor.row-this.range.start.row+1, 0, markerRange);
            this.lineSizes.splice(cursor.row-this.range.start.row+1, 0, 0);
            this.range.end.row += 1;
            editor.moveCursorTo(cursor.row+1, this.range.start.column);
            shiftLowerGaps(this, 1);
        } else {
            editor.moveCursorTo(cursor.row+1, cursor.column);
        }
    } else {
        return; // Can't make the box any bigger.
    }

    let rangeAfterCursor = new Range(cursor.row, cursor.column, cursor.row, this.range.start.column+this.calculateLineSize(cursor.row));
    let textAfterCursor = editor.session.doc.getTextRange(rangeAfterCursor);
    editor.session.replace(rangeAfterCursor, fillChar.repeat(textAfterCursor.length));
    editor.session.replace(new Range(cursor.row+1, this.range.start.column, cursor.row+1, this.range.start.column+textAfterCursor.length), textAfterCursor);
    
    this.lineSizes[cursor.row-this.range.start.row] -= textAfterCursor.length;
    this.updateLineSize(cursor.row+1, textAfterCursor.length);
    
    this.updateMarkerCSS();
}

Gap.prototype.removeLine = function(cursor) {
    let rangeAfterCursor = new Range(cursor.row, cursor.column, cursor.row, this.range.start.column+this.calculateLineSize(cursor.row));
    let textAfterCursor = editor.session.doc.getTextRange(rangeAfterCursor);
    
    editor.session.replace(new Range(cursor.row-1, this.range.start.column+this.calculateLineSize(cursor.row-1), cursor.row-1, this.range.start.column+this.calculateLineSize(cursor.row-1)+textAfterCursor.length), textAfterCursor);
    this.editor.moveCursorTo(cursor.row-1, this.range.start.column+this.calculateLineSize(cursor.row-1));

    this.updateLineSize(cursor.row-1, textAfterCursor.length);

    this.lineSizes.splice(cursor.row-this.range.start.row, 1);
    this.markerRanges.pop();
    this.range.end.row -= 1;
    this.updateMarkerCSS();
    shiftLowerGaps(this, -1);
    this.editor.session.remove(new Range(cursor.row, 0, cursor.row+1, 0));
}

Gap.prototype.setWidth = function(newWidth) {
    let cursor = this.editor.selection.getCursor();  // Current position of cursor.
    let delta = newWidth - (this.range.end.column - this.range.start.column);
    this.range.end.column += delta;
    this.updateMarkerRanges();

    // Update any gaps that come after this one on the same line.
    for (let other of gaps) {
        if (other.range.start.row === this.range.start.row && other.range.start.column > this.range.end.column) {
            other.range.start.column += delta;
            other.range.end.column += delta;
            other.updateMarkerRanges();
        }
    }

    if (delta > 0) {
        for (let row = this.range.start.row; row < this.range.end.row; row++) {
            if (this.calculateLineSize(row) < newWidth) {
                this.editor.session.insert({row: row, column: this.range.end.column-delta}, fillChar.repeat(delta));
            }
        }
    } else {
        for (let row = this.range.start.row; row < this.range.end.row; row++) {
            this.editor.session.remove(new Range(row, this.range.end.column, row, this.range.end.column-delta));
        }
    }

    this.editor.moveCursorTo(cursor.row, cursor.column);    // Restore cursor to old position.

    this.editor.$onChangeBackMarker();
    this.editor.$onChangeFrontMarker();
}

function shiftLowerGaps(gap, delta) {
    for (let other of gaps) {
        if (other.range.start.row >= gap.range.end.row) {
            other.range.start.row += delta;
            other.range.end.row += delta;
            other.updateMarkerRanges();
        }
    }
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
let splitter = new RegExp(sepLeft + ' *((?:\\d+(?:-\\d+)?)(?:,(?:\\d+(?:-\\d+)?))?) *' + sepRight);

let result = "";
let rowPos = 0;
for (let i = 0; i < lines.length; i++) {
    let bits = lines[i].split(splitter);
    result += bits[0];
    
    let columnPos = bits[0].length;
    for (let j = 1; j < bits.length; j += 2) {
        let params = bits[j].split(',');
        let minWidth = 1;
        let maxWidth = Infinity;
        let minHeight = 1;
        let maxHeight = 1;

        let widthValues = params[0].split('-');
        minWidth = parseInt(widthValues[0]);
        maxWidth = (widthValues.length > 1 ? parseInt(widthValues[1]) : Infinity);
        
        if (params.length === 2) {
            let heightValues = params[1].split('-');
            minHeight = parseInt(heightValues[0]);
            maxHeight = (heightValues.length > 1 ? parseInt(heightValues[1]) : minHeight);
        }
        
    
        // Create new gap.
        gaps.push(new Gap(editor, rowPos, columnPos, minWidth, maxWidth, minHeight, maxHeight));
        columnPos += minWidth;
        result += fillChar.repeat(minWidth);
        for (let k = 1; k < minHeight; k++) {
            result += '\n' + fillChar.repeat(columnPos);
            rowPos += 1;
        }

        if (j + 1 < bits.length) {
            result += bits[j+1];
            columnPos += bits[j+1].length;
        }
        
    }

    if (i < lines.length-1) {
        result += '\n';
    }
    rowPos += 1;
}

editor.session.setValue(result);

// gaps.push(new Gap(editor, 2, 13, 4, 10, 2, 4));

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
        if (gap != null && commandName === "gotoright" && cursor.column === gap.range.start.column+gap.calculateLineSize(cursor.row)) {
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
                if (gap.calculateLineSize(cursor.row) == gap.getWidth() && gap.getWidth() < gap.maxWidth) {    // Grow the size of gap and insert char.
                    gap.updateLineSize(cursor.row, 1);  // Important to record that line size has increased before insertion.;
                    editor.session.insert(cursor, char);
                } else if (gap.calculateLineSize(cursor.row) < gap.maxWidth) {   // Insert char.
                    editor.session.remove(new Range(cursor.row, gap.range.end.column-1, cursor.row, gap.range.end.column));
                    gap.updateLineSize(cursor.row, 1);  // Important to record that texSize has increased before insertion.
                    editor.session.insert(cursor, char);
                }
            } else if (char === '\n' && gap.isMultiline) {  // Handle insertion of newline.
                gap.insertLine(cursor);
            }
        } else if (commandName === "backspace") {
            if (cursor.column > gap.range.start.column && gap.calculateLineSize(cursor.row) > 0) {
                // 
                gap.updateLineSize(cursor.row, -1);
                if (gap.calculateLineSize(cursor.row) < gap.getWidth()) {  
                    editor.session.remove(new Range(cursor.row, cursor.column-1, cursor.row, cursor.column));  
                    editor.session.insert({row: cursor.row, column: gap.range.end.column-1}, fillChar);   // Put new space at end so everything is shifted across.
                } else {
                    editor.moveCursorTo(cursor.row, cursor.column-1);
                }                
            } else if (cursor.column === gap.range.start.column && cursor.row > gap.range.start.row+gap.minHeight-1) {
                gap.removeLine(cursor);
            }
        } else if (commandName === "del") {
            if (cursor.column < gap.range.start.column+gap.calculateLineSize(cursor.row) && gap.calculateLineSize(cursor.row) > 0) {
                editor.session.remove(new Range(cursor.row, cursor.column, cursor.row, cursor.column+1));
                gap.updateLineSize(cursor.row, -1);
                if (gap.calculateLineSize(cursor.row) < gap.getWidth()) {
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
        let lineSize = gap.calculateLineSize(cursor.row);
        if (cursor.column > gap.range.start.column+lineSize) {
            editor.moveCursorTo(cursor.row, gap.range.start.column+lineSize);
        }
    }
});