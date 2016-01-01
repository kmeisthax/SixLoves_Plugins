/*jslint nomen:false*/
/*global console*/

/*:
 * @author David Wendt (fantranslation.org)
 * @plugindesc A bunch of text rendering fixes for SixLoves. v0.2.0
 */

this.SixLoves_TextSystem = this.SixLoves_TextSystem || {};

(function (root, module) {
    "use strict";

    //TODO: Ensure window width calculation is correct - some windows might be
    //assuming text would never extend wider than a particular point or
    //something

    function cloneTextState(textState) {
        return {
            "x": textState.x,
            "y": textState.y,
            "index": textState.index,
            "left": textState.left,
            "text": textState.text,
            "height": textState.height,
            "lastSoftBreak": textState.lastSoftBreak,
            "width": textState.width
        };
    }

    /* Calculates the length of the next word on the line.
     *
     * This is actually slightly more difficult as certain escape characters can
     * increase text size, so this code has to be adjusted for any control codes
     * that will add extra text.
     */
    root.Window_Base.prototype.nextWordLength = function (textState) {
        var nextWordWidth = 0, lastNewlineIndex = -1,
            ourTextState = cloneTextState(textState),
            oldFontSize = this.contents.fontSize,
            mustStopProcessingText = false;

        while (ourTextState.index < ourTextState.text.length && !mustStopProcessingText) {
            switch (ourTextState.text[ourTextState.index]) {
            case '\f': //not sure what formfeeds do but w/e
                break;
            case '\n':
                if (lastNewlineIndex + 1 === ourTextState.index) {
                    //Only consecutive newlines generate a hard break.
                    //Hard breaks interrupt whatever is going on and thus
                    //immediately return the word width
                    mustStopProcessingText = true;
                } else if (textState.index === ourTextState.index) {
                    //Non-consecutive newlines are treated as a space.
                    //Don't break on the first space encountered, though.
                    nextWordWidth += this.textWidth(" ");
                } else {
                    //If the newline counts as a space, and it's not the
                    //first character encountered, stop processing.
                    mustStopProcessingText = true;
                }

                lastNewlineIndex = ourTextState.index;
                break;
            case "\x1b":
                // We have to emulate the font size text codes to get
                // accurate length counts.
                switch (this.obtainEscapeCode(ourTextState)) {
                case "{":
                    this.makeFontBigger();
                    break;
                case "}":
                    this.makeFontSmaller();
                    break;
                default:
                    break;
                }
                break;
            case " ":
                if (textState.index === ourTextState.index) {
                    //Don't count the first space as "ending" the current
                    //word. This lets us call nextWordLength when we
                    //encounter a space.
                    nextWordWidth += this.textWidth(ourTextState.text[ourTextState.index]);
                } else {
                    //We're only interested in what happens up to a space
                    mustStopProcessingText = true;
                }
                break;
            default:
                nextWordWidth += this.textWidth(ourTextState.text[ourTextState.index]);
                break;
            }

            ourTextState.index += 1;
        }

        //Restore the old font size code as we may have altered it in the
        //process of counting text lengths.
        this.contents.fontSize = oldFontSize;

        return nextWordWidth;
    };

    root.Window_Base.prototype.processSpace = function (textState) {
        var nextWordWidth = this.nextWordLength(textState),
            //This assumes there are no windows with right-hand text limits.
            availableSpace = this.contentsWidth() - textState.x;

        if (textState.width !== undefined) {
            availableSpace = textState.width - (textState.x - textState.left);
        }

        if (nextWordWidth > availableSpace) {
            console.log("Next word width " + nextWordWidth + " exceeds " + availableSpace);

            textState.lastSoftBreak = textState.index;

            this.processNewLine(textState);
        } else {
            this.processNormalCharacter(textState);
        }
    };

    /* Given a newline, determine what it's actually supposed to do.
     */
    root.Window_Base.prototype.determineNewlineEffect = function (textState) {
        if (textState.text[textState.index] === "\n") {
            if (textState.index > 0 && textState.text[textState.index - 1] === "\n") {
                if (textState.index > 1 && textState.text[textState.index - 2] === "\n") {
                    //Third newline. Always breaks.
                    return "hardbreak";
                } else if (textState.lastSoftBreak !== textState.index - 1) {
                    //Seoond newline. First did not generate a space.
                    return "hardbreak";
                } else {
                    //Second newline. We already had a soft break from a space
                    //so don't do anything
                    return "nothing";
                }
            } else {
                //First newline. Treated as space.
                return "space";
            }
        } else {
            return "nothing";
        }
    };

    root.Window_Base.prototype.processCharacter = function (textState) {
        switch (textState.text[textState.index]) {
        case '\n':
            if (textState.index > 0 && textState.text[textState.index - 1] === "\n"
                    && textState.lastSoftBreak !== textState.index - 1) {
                //Second or further newline in a newline sequence, and the last
                //character has not already created a softbreak.
                this.processNewLine(textState);
            } else if (textState.index > 0 && textState.text[textState.index - 1] === "\n") {
                //Second or further newline, but the previous character was
                //already turned into a space and therefore we don't need to do
                //anything.
                textState.index += 1;
                break;
            } else {
                //Do not process singular newlines or the first newline in a
                //series of newlines. Instead, process them as a space.
                this.processSpace(textState);
            }

            break;
        case '\f':
            this.processNewPage(textState);
            break;
        case '\x1b':
            this.processEscapeCharacter(this.obtainEscapeCode(textState), textState);
            break;
        case ' ':
            this.processSpace(textState);
            break;
        default:
            this.processNormalCharacter(textState);
            break;
        }
    };

    root.Window_Base.prototype.processEscapeCharacter = (function (old_impl) {
        return function (code, textState) {
            old_impl.call(this, code, textState);
            /*
            switch (code) {
                //New control codes go here.
            default:
                return old_impl.call(this, code, textState);
            }*/
        };
    }(root.Window_Base.prototype.processEscapeCharacter));

    /* Patch calcTextHeight to determine line count taking into account our own
     * word-wrap code.
     */
    root.Window_Base.prototype.calcTextHeight = function (textState, all) {
        var lastFontSize = this.contents.fontSize, maxFontSize,
            textHeight = 0,
            lines = textState.text.slice(textState.index).split('\n'),
            maxLines = all ? Infinity : 1,
            remainingWidth = this.contentsWidth() - (textState.x === undefined ? this.textPadding() : textState.left),
            newlineEffect = "nothing",
            lastSoftBreak,
            ourTextState = cloneTextState(textState);

        if (textState.width !== undefined) {
            remainingWidth = (textState.left + textState.width) - (textState.x === undefined ? this.textPadding() : textState.left);
        }

        maxFontSize = this.contents.fontSize;

        while (maxLines > 0 && ourTextState.index < ourTextState.text.length) {
            newlineEffect = "nothing";

            switch (ourTextState.text[ourTextState.index]) {
            case '\n':
                newlineEffect = this.determineNewlineEffect(ourTextState);
                break;
            case '\f':
                newlineEffect = "hardbreak"; //TODO: Is this actually correct?
                break;
            case '\x1b':
                //What we came here for
                switch (this.obtainEscapeCode(ourTextState)) {
                case "{":
                    this.makeFontBigger();
                    break;
                case "}":
                    this.makeFontSmaller();
                    break;
                default:
                    break;
                }

                //We're going to increment the index AGAIN, so pull it back
                ourTextState.index -= 1;

                if (maxFontSize < this.contents.fontSize) {
                    maxFontSize = this.contents.fontSize;
                }

                break;
            case ' ':
                newlineEffect = "space";
                break;
            default:
                remainingWidth -= this.textWidth(ourTextState.text[ourTextState.index]);
                break; //Don't care.
            }

            if (newlineEffect === "space") {
                if (Math.ceil(this.nextWordLength(ourTextState)) > remainingWidth) {
                    newlineEffect = "hardbreak";
                    lastSoftBreak = ourTextState.index;
                } else {
                    remainingWidth -= this.textWidth(" ");
                }
            }

            if (newlineEffect === "hardbreak" || ourTextState.text.length === ourTextState.index + 1) {
                textHeight += maxFontSize + 8;
                remainingWidth = this.contentsWidth() - (textState.x === undefined ? this.textPadding() : textState.left);

                if (textState.width !== undefined) {
                    remainingWidth = (textState.left + textState.width) - (textState.x === undefined ? this.textPadding() : textState.left);
                }

                maxFontSize = this.contents.fontSize;
                maxLines -= 1;
            }

            ourTextState.index += 1;
        }

        if (maxLines > 0) {
            //We exited because we ran out of text, so let's make sure the text
            //height is present here
            textHeight += maxFontSize + 8;
        }

        this.contents.fontSize = lastFontSize;
        return textHeight;
    };

    /* Patch drawTextEx to support a fourth parameter which explicitly sets a
     * text width maximum.
     *
     * If undefined, the maximum width will be the width of the window minus
     * padding and the start X position.
     *
     * If Infinity, no spaces nor soft breaks will cause an actual line break.
     * This is to support the textWidthEx function from Window_ChoiceList.
     */
    root.Window_Base.prototype.drawTextEx = function (text, x, y, width) {
        if (text) {
            var textState = { index: 0, x: x, y: y, left: x, width: width };
            textState.text = this.convertEscapeCharacters(text);
            textState.height = this.calcTextHeight(textState, false);
            this.resetFontSettings();
            while (textState.index < textState.text.length) {
                this.processCharacter(textState);
            }
            return textState.x - x;
        } else {
            return 0;
        }
    };

    /* Fix ChoiceList widths
     */
    root.Window_ChoiceList.prototype.textWidthEx = function (text) {
        return this.drawTextEx(text, 0, this.contents.height, Infinity);
    };

    module.status = "loaded";
    module.version = "0.2.0";
}(this, this.SixLoves_TextSystem));
