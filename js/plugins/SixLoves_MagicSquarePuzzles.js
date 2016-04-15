/*jslint nomen:true*/
/*global console, window*/

/*:
 * @author David Wendt (fantranslation.org)
 * @plugindesc Adds state machine logic for puzzle solving. v0.4.0
 * @help
 *     Implements logic for puzzles where the user must construct a magic
 * square.
 */

window.SixLoves_MagicSquarePuzzles = window.SixLoves_MagicSquarePuzzles || {};

(function (root, module) {
    "use strict";

    var default_magic_square = {
        "size": 0,
        "data": []
    }, current_magic_square = Object.create(default_magic_square);

    /* This class covers "magic square" puzzles.
     *
     * A magic square is a type of matrix where the columns, rows, and
     * diagonals
     */
    function Game_MagicSquare() {
        this.size = 0;
        this.data = [];
        this.current_number = 0;
    }

    /* Set the size of an impending magic square puzzle.
     */
    Game_MagicSquare.prototype.set_size = function (new_size) {
        this.size = parseInt(new_size, 10);
        this.data = new Array(this.size * this.size);
    };

    /* Calculate the magic constant for a particular size.
     */
    Game_MagicSquare.prototype.magic_constant = function (size) {
        size = parseInt(size, 10);

        if (size === undefined || isNaN(size)) {
            size = this.size;
        }

        return size * (Math.pow(size, 2) + 1) / 2;
    };

    /* Place the next number in sequence at a particular spot.
     *
     * When called, the current number will be placed in that particular spot
     * on the board, and then the current number will be incremented modulo the
     * number of slots on the board. You should check the state of the magic
     * square after calling move_to_spot.
     *
     * Returns the number that was deposited in the spot.
     */
    Game_MagicSquare.prototype.move_to_spot = function (x_loc, y_loc, gvslot) {
        var stored_number;

        x_loc = parseInt(x_loc, 10) - 1;
        y_loc = parseInt(y_loc, 10) - 1;
        gvslot = parseInt(gvslot, 10);

        stored_number = this.current_number + 1;

        this.current_number = (this.current_number + 1) % (this.size * this.size);

        this.data[x_loc + y_loc * this.size] = stored_number;

        if (gvslot !== undefined && !isNaN(gvslot)) {
            root.$gameVariables.setValue(gvslot, stored_number);
        }

        return stored_number;
    };

    /* Retrieve the number currently present in a particular spot.
     *
     * Returns 1 to the number of matrix cells for this particular spot's
     * value; or 0 for an unselected spot.
     *
     * Also will store the returned
     */
    Game_MagicSquare.prototype.retrieve_spot = function (x_loc, y_loc, gvslot) {
        var ret;

        x_loc = parseInt(x_loc, 10) - 1;
        y_loc = parseInt(y_loc, 10) - 1;
        gvslot = parseInt(gvslot, 10);

        ret = this.data[x_loc + y_loc * this.size];
        if (ret === undefined) {
            ret = 0;
        }

        if (gvslot !== undefined && !isNaN(gvslot)) {
            root.$gameVariables.setValue(gvslot, ret);
        }

        return ret;
    };

    /* Check if the puzzle is solved.
     *
     * Returns -1 if puzzle is not a valid magic square.
     * Returns 1 if puzzle is a valid magic square.
     * Returns 0 if puzzle is too incomplete to tell.
     *
     * Optionally, stores the return value in the specified game variable slot.
     * This is useful for scripts.
     */
    Game_MagicSquare.prototype.check_state = function (gvslot) {
        var ret, i, j, sum,
            magic_constant = this.magic_constant(this.size);

        //check if the puzzle is even completed yet
        for (i = 0; i < this.data.length; i += 1) {
            if (this.data[i] === undefined) {
                ret = 0;
            }
        }

        //row checks

        //this would be a good time for javascript to have GOTO or multi-loop
        //breaks
        for (i = 0; i < this.size && ret === undefined; i += 1) {
            for (j = 0, sum = 0; j < this.size && ret === undefined; j += 1) {
                if (this.data[i * this.size + j] === undefined ||
                        this.data[i * this.size + j] === null) {
                    ret = 0;
                } else {
                    sum += this.data[i * this.size + j];
                }
            }

            if (sum !== magic_constant && ret === undefined) {
                //Fail the puzzle, this row is incorrect.
                ret = -1;
            }
        }

        //col checks

        //we omit the completeness check as the row checks already did that
        for (i = 0; i < this.size && ret === undefined; i += 1) {
            for (j = 0, sum = 0; j < this.size && ret === undefined; j += 1) {
                sum += this.data[j * this.size + i];
            }

            if (sum !== magic_constant && ret === undefined) {
                //Fail the puzzle, this column is incorrect.
                ret = -1;
            }
        }

        //down-right diagonal check
        for (i = 0, sum = 0; i < this.size && ret === undefined; i += 1) {
            sum += this.data[i * this.size + i];
        }

        if (sum !== magic_constant && ret === undefined) {
            //Fail the puzzle, this diagonal is incorrect.
            ret = -1;
        }

        //down-left diagonal check
        for (i = 0, j = this.size - 1, sum = 0; i < this.size && ret === undefined; i += 1, j -= 1) {
            sum += this.data[i * this.size + j];
        }

        if (sum !== magic_constant && ret === undefined) {
            //Fail the puzzle, this diagonal is incorrect.
            ret = -1;
        }

        if (ret === undefined) {
            //No previous checks failed, puzzle is solved
            ret = 1;
        }

        if (gvslot !== undefined) {
            root.$gameVariables.setValue(parseInt(gvslot, 10), ret);
        }

        return ret;
    };

    /* Patch the interpreter to recognize commands for magic square puzzles.
     *
     * We just look in the object for the appropriate method and call it with
     * the remaining arguments.
     */
    root.Game_Interpreter.prototype.pluginCommand = (function (old_impl) {
        return function (command, args) {
            old_impl.call(this, command, args);

            if (command === "SixLoves_MagicSquarePuzzles") {
                module.$gameMagicSquare[args[0]].apply(module.$gameMagicSquare, args.slice(1));
            }
        };
    }(root.Game_Interpreter.prototype.pluginCommand));

    module.Game_MagicSquare = Game_MagicSquare;
    module.$gameMagicSquare = new Game_MagicSquare();

    module.status = "loaded";
    module.version = "0.4.0";
}(window, window.SixLoves_StateMachinePuzzles));
