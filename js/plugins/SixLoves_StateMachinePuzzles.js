/*jslint nomen:true*/
/*global console, window*/

/*:
 * @author David Wendt (fantranslation.org)
 * @plugindesc Adds state machine logic for puzzle solving. v0.3.0
 * @help
 *     Ever wanted to have state machine logic for puzzles?
 *     Say, a puzzle where you have to press a certain set of buttons in order,
 * and you didn't wanna have to deal with all sorts of complicated switch logic?
 * Then this is the plugin for you!
 */

window.SixLoves_StateMachinePuzzles = window.SixLoves_StateMachinePuzzles || {};

(function (root, module) {
    "use strict";
    var default_state_machine = {
        "completed": false,
        "failed": false,
        "states": [],
        "goal_states": [],
        "fail_states": [],
        "valid_transitions": {},
        "current_state": null
    }, current_state_machine = Object.create(default_state_machine);

    root.Game_Interpreter.prototype.pluginCommand = (function (old_impl) {
        return function (command, args) {
            var i, ls;

            old_impl.call(this, command, args);

            if (command === "SixLoves_StateMachinePuzzles") {
                switch (args[0]) {
                case "StartStateMachine":
                    //Reset the current state machine.
                    current_state_machine = Object.create(default_state_machine);
                    break;
                case "RecognizeState":
                    for (i = 1; i < args.length; i += 1) {
                        current_state_machine.states.push(args[i]);
                    }
                    break;
                case "AllowTransition":
                    ls = args[1];

                    for (i = 2; i + 1 < args.length; i += 2) {
                        if (current_state_machine.valid_transitions[ls] === undefined) {
                            current_state_machine.valid_transitions[ls] = {};
                        }

                        current_state_machine.valid_transitions[ls][args[i]] = args[i + 1];
                        ls = args[i + 1];
                    }
                    break;
                case "SetGoalState":
                    current_state_machine.goal_states.push(args[1]);
                    break;
                case "SetFailState":
                    current_state_machine.fail_states.push(args[1]);
                    break;
                case "SetState":
                    if (current_state_machine.states.indexOf(args[1]) !== -1) {
                        current_state_machine.current_state = args[1];
                    }
                    break;
                case "Input":
                    //Consume args[1], attempt to transition
                    if (current_state_machine.failed || current_state_machine.completed) {
                        //can't move anymore.
                        console.warn("Machine broken or completed, script logic should check that");
                        break;
                    }

                    if (current_state_machine.current_state === null) {
                        //don't know where to start.
                        console.error("Machine initial state not set!");
                        break;
                    }

                    if (current_state_machine.valid_transitions[current_state_machine.current_state][args[1]] === undefined) {
                        //invalid transition
                        current_state_machine.failed = true;
                        console.error("Transition from " + current_state_machine.current_state + " through " + args[1] + " is invalid!");
                        console.log("Valid transitions are " + Object.keys(current_state_machine.valid_transitions[current_state_machine.current_state]));
                        break;
                    }

                    //transition and state are valid, so transition
                    current_state_machine.current_state = current_state_machine.valid_transitions[current_state_machine.current_state][args[1]];

                    if (current_state_machine.goal_states.indexOf(current_state_machine.current_state) !== -1) {
                        //transitioned to goalstate, complete the machine
                        console.log(current_state_machine.current_state + " is a goal state");
                        current_state_machine.completed = true;
                    }

                    if (current_state_machine.fail_states.indexOf(current_state_machine.current_state) !== -1) {
                        //transitioned to failstate, break the machine
                        console.log(current_state_machine.current_state + " is a fail state");
                        current_state_machine.failed = true;
                    }

                    console.log("Transition to " + current_state_machine.current_state);
                    break;
                case "CheckMachineStatus":
                    if (args[1] === undefined) {
                        break;
                    }

                    console.log("Machine check: " + args[1]);

                    if (current_state_machine.completed) {
                        root.$gameVariables.setValue(parseInt(args[1], 10) + 1, 1);
                        break;
                    }

                    if (current_state_machine.failed) {
                        root.$gameVariables.setValue(parseInt(args[1], 10) + 1, -1);
                        break;
                    }

                    root.$gameVariables.setValue(parseInt(args[1], 10) + 1, 0);
                    break;
                }
            }
        };
    }(root.Game_Interpreter.prototype.pluginCommand));

    module.get_current_state_machine = function () {
        return current_state_machine;
    };

    module.status = "loaded";
    module.version = "0.3.0";
}(window, window.SixLoves_StateMachinePuzzles));
