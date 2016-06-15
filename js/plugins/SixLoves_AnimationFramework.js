/*jslint nomen:false*/
/*global console, window*/

/*:
 * @author David Wendt (fantranslation.org)
 * @plugindesc Provides animation helpers. v0.4.0
 *
 * @help
 *
 *      Provides animation helpers. Only necessary for other custom scripts
 * that require this module's code.
 */


window.SixLoves_AnimationFramework = window.SixLoves_AnimationFramework || {};

(function (root, module) {
    "use strict";

    var force_frame_adaptive;

    if (root.SixLoves_Responsive === undefined) {
        console.warn("SixLoves_AnimationFramework works great with SixLoves_Responsive's high framerate support!");
        force_frame_adaptive = function (dontcare, func, that) {
            func.apply(that);
        };
    } else {
        force_frame_adaptive = root.SixLoves_Responsive.force_frame_adaptive;
    }



    /* Easings are functions that determine how an animation flows through time
     * by mapping incoming time values from 0 to 1 to the actual animated
     * channel quantity, again in 0 to 1.
     */
    module.Easings = {};

    /* These functions let us reverse and reflect an easing without resorting
     * to stupid codegolfing tricks like jQuery Easing.
     */
    function reverse_easing(inner_ease) {
        return function (t) {
            return 1 - inner_ease(t * -1 + 1);
        };
    }

    function reflect_easing(forward_ease) {
        var reverse_ease = reverse_easing(forward_ease);

        return function (t) {
            if (t < 0.5) {
                return forward_ease(t * 2) / 2;
            } else {
                t -= 0.5;
            }
            return reverse_ease(t * 2) / 2 + 0.5;
        };
    }

    /* Immediate easing cancels the transition entirely and causes the change
     * in question to occur immediately.
     *
     * The In version of this easing completes the entire transition at the
     * start of the animation (0% elapsed); Out completes the transition at the
     * end (100% elapsed); and InOut completes the transition in the middle
     * (50% elapsed).
     */
    module.Easings.immediateIn = function (t) {
        return t === 0 ? 0 : 1;
    };

    module.Easings.immediateOut = reverse_easing(module.Easings.immediateIn);
    module.Easings.immediateInOut = reflect_easing(module.Easings.immediateIn);

    /* Linear easing maps time directly to motion along the channel without
     * any remapping.
     *
     * There are no In, Out, or InOut variants as they will be identical to
     * each other.
     */
    module.Easings.linear = function (t) {
        return t;
    };

    /* Quadratic easing maps time to the quadratic curve x^2.
     */
    module.Easings.quadraticIn = function (t) {
        return t * t;
    };

    module.Easings.quadraticOut = reverse_easing(module.Easings.quadraticIn);
    module.Easings.quadraticInOut = reflect_easing(module.Easings.quadraticIn);

    /* An AnimationChannel is an object which can accept changes to a quantity
     * based on the passing of time, optionally modified by an easing function.
     *
     * This default implementation takes an object and a property name, which
     * will be modified as appropriate to satisfy the channel's needs.
     *
     *     x_animation_channel = new AnimationChannel(this, "x")
     *
     * Anything tweened on the x_animation_channel would thus affect the "x"
     * variable as calculated by the channel.
     *
     * Animation channels may also have an optional name; which if not
     * specified will be set equal to the name of the property controlled by
     * the channel.
     */
    function AnimationChannel(object, property, name) {
        if (name === undefined) {
            name = property;
        }

        this.object = object;
        this.property = property;
        this.name = name;

        //Set of animation data imported into this object.
        this.animations = {};

        //Defaults
        this.loop = false;

        this.cancel_animation();
    }

    /* Cancel a tween in progress and reset any internal state back to default
     * settings.
     */
    AnimationChannel.prototype.cancel_animation = function () {
        this.in_tween = false;
        this.current_tween = 0;
        this.tween_stack = [];
    };

    /* Stop the animation in progress and reset playback to the beginning. */
    AnimationChannel.prototype.stop = function () {
        var i = 0;

        this.in_tween = false;
        this.current_tween = 0;

        for (i = 0; i < this.tween_stack.length; i += 1) {
            this.tween_stack[i].current_time = 0;
        }
    };

    /* Pause the animation in progress. Playback will resume from the current
     * position
     */
    AnimationChannel.prototype.pause = function () {
        this.in_tween = false;
    };

    /* Play the animation as queued. */
    AnimationChannel.prototype.play = function () {
        this.in_tween = true;
    };

    /* Configure a transition from the current channel value to a new value,
     * taking the specified amount of time and using a specified easing.
     *
     * Time should always be in units of frames.
     *
     * Providing undefined as the start value transitions from the current
     * property value.
     *
     * This function will return an ID number of the animation; you may queue
     * up multiple tweens at once and then wait for the animation's completion
     * event in order to do something else when done.
     */
    AnimationChannel.prototype.tween = function (target_value, time, easing, start_value) {
        var tween_data = {};

        if (start_value === undefined) {
            if (this.tween_stack.length > 0) {
                start_value = this.tween_stack[this.tween_stack.length - 1].target_property_value;
            } else {
                start_value = this.object[this.property];
            }
        }

        if (easing === undefined) {
            easing = function (t) { return t; };
        }

        if (time === Infinity) {
            //Special case: Infinity means "set this value and stop animating."
            start_value = target_value;
        }

        tween_data.current_time = 0;
        tween_data.target_time = time;
        tween_data.starting_property_value = start_value;
        tween_data.target_property_value = target_value;
        tween_data.tween_easing = easing;

        this.tween_stack.push(tween_data);

        return this.tween_stack.length - 1;
    };

    /* Mass-import animation data (say, from a JSON file or something)
     *
     * AnimationChannel expects data to look like so:
     *
     *  {
     *    loop: TRUE, //or FALSE.
     *    initial_value: -5.0, //Substitute for initial value of first tween.
     *    tweens: [
     *      //Parameter 1 is the next value
     *      //Parameter 2 is the time the transition takes (in frames)
     *      //Parameter 3 is the easing, pulled from the Easings object
     *      //Parameter 4 is the previous value.
     *      //  normally not needed, unless you intentionally want a G0
     *      //  discontinuity
     *      [0.0, 120, "linear"],
     *      [5.0, 120, "quadraticIn"],
     *      [-15, 240, "quadraticOut]
     *    ],
     *    constant: 0.0 //If tween data missing, creates a single infinite tween
     *                  //that effectively sets data constant.
     *  }
     *
     * Animation data is stored in the channel's animation list. To actually
     * start a particular animation, use the transition method to copy the
     * animation into the channel's current animation data.
     */
    AnimationChannel.prototype.import_animation = function (data, name) {
        this.animations[name] = data;
    };

    /* Transition to the new animation immediately, by cancelling the current
     * tween stack.
     */
    AnimationChannel.TRANSITION_METHOD_IMMEDIATE = 0;

    /* Transition to the new animation after the current tween stack finishes.
     */
    AnimationChannel.TRANSITION_METHOD_AFTER = 1;

    /* Append the transition and new animation data onto the current tween
     * stack, creating a hybrid animation that loops between multiple segments.
     * For correct looping, a second transition will be added to transition
     * back from the end state of the new animation to the start state of the
     * old one.
     *
     * Implicitly enables looping playback, since that's the only play mode
     * that makes sense in APPEND mode.
     *
     * After the transition method is called, the current_name property of the
     * channel will be set to a mixture of both names.
     */
    AnimationChannel.TRANSITION_METHOD_APPEND = 1;

    /* Copy an animation onto the current animation stack.
     *
     * Not to be called by external code. Instead, use .transition, as it
     * provides proper options for blending animations together.
     */
    AnimationChannel.prototype.copy_data_to_stack = function (data) {
        var i, argv, ease;

        this.loop = data.loop;
        if (data.tweens !== undefined) {
            for (i = 0; i < data.tweens.length; i += 1) {
                argv = data.tweens[i];
                ease = module.Easings[argv[2]];

                if (argv === 0 && argv.length < 4) {
                    //Fill in the FIRST tween value's start value.
                    this.tween(argv[0], argv[1], ease, data.initial_value);
                } else {
                    this.tween(argv[0], argv[1], ease, argv[3]);
                }
            }
        } else if (data.constant !== undefined) {
            this.tween(data.constant, Infinity);
        } else if (data.constructor !== Object) {
            //Variable "data" doesn't match our format
            //Assume it's constant data instead
            this.tween(data, Infinity);
        }
    };

    /* Transition to a new, previously imported animation.
     *
     * The transition_method determines how the channel will take the selected
     * animaiton data and add it to the tween stack. Each method is described
     * on it's own transition constant.
     *
     * The two transition_time parameters are used to control the length of
     * inter-animation tweens from the current animation to the new one, as
     * well as a reverse tween back to the current animation for transition
     * methods that keep the old animation alive.
     */
    AnimationChannel.prototype.transition = function (name, transition_method, transition_time, transition_easing, transition_time_2, transition_easing_2) {
        var tween_state = this.in_tween, last_tween_id = this.tween_stack.length - 1,
            intended_final_value, intended_start_value,
            data_initial_value,
            data = this.animations[name];

        if (transition_method === undefined) {
            transition_method = AnimationChannel.TRANSITION_METHOD_IMMEDIATE;
        }

        if (transition_time === undefined) {
            transition_time = 0;
        }

        if (transition_time_2 === undefined) {
            transition_time_2 = 0;
        }

        if (typeof transition_easing === "string") {
            transition_easing = module.Easings[transition_easing];
        }

        if (typeof transition_easing_2 === "string") {
            transition_easing_2 = module.Easings[transition_easing_2];
        }

        if (last_tween_id > 0) {
            intended_final_value = this.tween_stack[last_tween_id].target_property_value;
        }

        if (this.tween_stack.length > 0) {
            intended_start_value = this.tween_stack[0].starting_property_value;
        } else {
            //Special case: Appending to an empty tween stack
            //Some notes: We read the current property value since, if the
            //current tween stack is empty, then there isn't a target value
            //for the transition TO the new animation. Therefore, it will start
            //from the current value. As a result, transitions back to that
            //intial tween will need to go to this.read().
            intended_start_value = this.read();
        }

        data_initial_value = data.initial_value;
        if (data.initial_value === undefined) {
            data_initial_value = data.constant;
        }

        switch (transition_method) {
        case AnimationChannel.TRANSITION_METHOD_IMMEDIATE:
            this.cancel_animation();
            this.tween(data_initial_value, transition_time, transition_easing, this.read());
            this.in_tween = tween_state;
            this.next_animation = name;
            break;
        case AnimationChannel.TRANSITION_METHOD_AFTER:
            this.tween(data_initial_value, transition_time, transition_easing, intended_final_value);
            this.next_animation = name;
            break;
        case AnimationChannel.TRANSITION_METHOD_APPEND:
            this.tween(data_initial_value, transition_time, transition_easing, intended_final_value);
            this.copy_data_to_stack(data);
            this.tween(intended_start_value, transition_time, transition_easing);
            //Since this creates a mixed animation, mix the current names, too.
            this.current_animation = this.current_animation + "," + name;
            break;
        }
    };

    /* Interpolate the channel's underlying data type.
     *
     * The purpose of this function is for subclasses to replace how an
     * animation's percentage progress is used to interpolate between a start
     * and an end state. For example, if your data type is not a JavaScript
     * Number or if linear interpolation of it must be done in a different way
     * mathematically.
     *
     * Regardless of how you replace this method, it must maintain the
     * property of linearity: that is, the speed (derivative) of the animation
     * (function) must be constant or as constant as possible for your data
     * type's definition of speed.
     */
    AnimationChannel.prototype.lerp = function (from, to, q) {
        return (to - from) * q + from;
    };

    /* Read a value from the underlying quantity being animated.
     *
     * AnimationChannel subclasses may use this function to bypass the normal
     * property writing path for using AnimationChannel with things that are
     * not properties.
     */
    AnimationChannel.prototype.read = function () {
        return this.object[this.property];
    };

    /* Write a value to the underlying quantity being animated.
     *
     * AnimationChannel subclasses may use this function to bypass the normal
     * property writing path for using AnimationChannel with things that are
     * not properties.
     */
    AnimationChannel.prototype.write = function (value) {
        this.object[this.property] = value;
    };

    /* An update function for the animation channel which consumes time.
     * Supports frame-adaptive animation.
     */
    AnimationChannel.prototype.update = function (frame_count) {
        var pct_t, pct_q, time, tween_data, remaining_time, this_time, lerped;

        if (frame_count === undefined) {
            frame_count = 1;
        }

        remaining_time = frame_count;

        while (this.in_tween && remaining_time > 0 && this.current_tween < this.tween_stack.length) {
            tween_data = this.tween_stack[this.current_tween];
            this_time = Math.min(tween_data.target_time - tween_data.current_time, remaining_time);
            if (this_time === Infinity || isNaN(this_time)) {
                if (isNaN(this_time)) {
                    //Treat NaN as a logic error and report it
                    console.err("Somehow, channel " + this.name + " got NaN time. Stopping animation.");
                }
                //Special case for infinte values, just use the ending value
                //and then stop animating.
                this.write(tween_data.target_property_value);
                break;
            }

            if (tween_data.target_time > 0) {
                tween_data.current_time += this_time;
                remaining_time -= this_time;

                pct_t = tween_data.current_time / tween_data.target_time;
                pct_q = tween_data.tween_easing(pct_t);

                lerped = this.lerp(tween_data.starting_property_value,
                                   tween_data.target_property_value,
                                   pct_q);

                this.write(lerped);
            } else {
                //0-length animations need to be special cased because calculus
                //i.e. isNaN(0/0) === TRUE
                this.write(tween_data.target_property_value);
            }

            if (tween_data.current_time >= tween_data.target_time) {
                tween_data.current_time = tween_data.target_time;
                this.current_tween += 1;

                if (this.current_tween === this.tween_stack.length) {
                    //Note that this can extend the while(){}, say if the
                    //animation loops. The only true bound on runtime is the
                    //framecount.
                    this.on_animation_completed();
                }

                //Special case: if we have or wind up with a 0-length animation
                //don't process it more than once per frame to avoid infinite
                //loops.
                if (this.animation_length() === 0) {
                    break;
                }
            }
        }

        return frame_count;
    };

    /* Calculate the length of the current tween stack.
     */
    AnimationChannel.prototype.animation_length = function () {
        var sum = 0, i;

        for (i = 0; i < this.tween_stack.length; i += 1) {
            sum += this.tween_stack[i].target_time;
        }

        return sum;
    };

    /**
     * Called when an animation has completed.
     *
     * If the next_animation property has been declared on this obejct, say
     * as a result of invoking .transition, then
     * TODO: Add support for external events.
     */
    AnimationChannel.prototype.on_animation_completed = function () {
        this.stop();

        if (this.next_animation !== undefined) {
            this.cancel_animation();
            this.copy_data_to_stack(this.animations[this.next_animation]);
            this.current_animation = this.next_animation;
            this.next_animation = undefined;
            this.play();
        }

        if (this.loop === true) {
            this.play();
        }
    };

    /* Special subclass of AnimationChannel specifically for FBF animation.
     * Necessary for FBF-animated sprites.
     */
    function FBFAnimationChannel(object, name) {
        if (name === undefined) {
            name = "frame";
        }

        AnimationChannel.call(this, object, "frame", name);
    }

    FBFAnimationChannel.prototype = Object.create(AnimationChannel.prototype);
    FBFAnimationChannel.prototype.constructor = FBFAnimationChannel;

    /* Sprite_Animation changes frames through a function call, not a property
     */
    FBFAnimationChannel.prototype.write = function (value) {
        this.object.change_frame(value);
    };

    /* Frame IDs are integers, so round them there.
     */
    FBFAnimationChannel.prototype.lerp = function (from, to, q) {
        return Math.round((to - from) * q + from);
    };

    function ColorAnimationChannel(object, property, name) {
        AnimationChannel.call(this, object, property, name);
    }

    ColorAnimationChannel.prototype = Object.create(AnimationChannel.prototype);
    ColorAnimationChannel.prototype.constructor = ColorAnimationChannel;

    /* Linear interpolation of color vectors.
     *
     * We have to lerp each component separately. We also assume the inputs are
     * all ultimately 4-element arrays representing 4-vectors.
     */
    ColorAnimationChannel.prototype.lerp = function (from, to, q) {
        var i, ret = [];

        for (i = 0; i < 4; i += 1) {
            ret.push((to[i] - from[i]) * q + from[i]);
        }

        return ret;
    };

    /* Update function to be attached to an object with a channels property.
     *
     * When called, all channels on the attached object are moved forward by
     * the framecount.
     *
     * Do not call directly (doing so violates strict mode). Instead, attach
     * to the prototype of your desired object. e.g.
     *
     * Sprite_WithChannels.prototype.update_channels = update_channels;
     */


    /**
     * Object which controls multiple animation channels at once.
     */
    function AnimationController() {
        this.channels = {};
    }

    /**
     * Apply the same method on a bunch of objects.
     */
    function apply_all(objects, method, args) {
        var k;

        for (k in objects) {
            if (objects.hasOwnProperty(k)) {
                objects[k][method].apply(objects[k], args);
            }
        }
    }

    /**
     * Copy an object's animation channels into the controller.
     *
     * For a single object's controller, calling import_channels without prefix
     * is fine. If you plan to aggregate multiple objects' channels, you should
     * provide a prefix name for each one.
     *
     * Channels that are imported will be renamed according to the prefix given.
     * For example, if you import two objects, both having an x and y channel,
     * and give the first a prefix of face1, and the second a prefix of face2,
     * this controller will have channels named as such:
     *
     *   face1.x, face1.y, face2.x, face2.y
     */
    AnimationController.prototype.import_channels = function (other_obj, prefix) {
        if (prefix === undefined) {
            prefix = "";
        }

        var k, pname;

        for (k in other_obj.channels) {
            if (other_obj.channels.hasOwnProperty(k)) {
                if (prefix === "") {
                    pname = k;
                } else {
                    pname = prefix + "." + k;
                }

                this.channels[pname] = other_obj.channels[k];
            }
        }
    };

    /**
     * Import multiple channels' animation data in at once.
     *
     * The data is expected in the following format:
     *
     *   {
     *     object1: //see AnimationChannel.prototype.import_animation
     *     object2: //ibid.
     *     // ...
     *   }
     *
     * Simply put, the keys of the data object correspond to imported channels
     * in the controller, and the values are passed directly to the channel's
     * own import_animation method. Data that does not correspond to an
     * imported channel will not be processed.
     *
     * The name is sent to all channels in the controller.
     */
    AnimationController.prototype.import_animation = function (data, name) {
        var k;

        for (k in this.channels) {
            if (this.channels.hasOwnProperty(k)) {
                this.channels[k].import_animation(data[k], name);
            }
        }
    };

    /* Transition all channels to a new animation.
     *
     * Parameters are identical to AnimationChannel's .transition method.
     */
    AnimationController.prototype.transition = function () {
        apply_all(this.channels, "transition", arguments);
    };

    /* Cancel a tween in progress and reset any internal state back to default
     * settings.
     */
    AnimationController.prototype.cancel_animation = function () {
        apply_all(this.channels, "cancel_animation");
    };

    /* Stop the animation in progress and reset playback to the beginning. */
    AnimationController.prototype.stop = function () {
        apply_all(this.channels, "stop");
    };

    /* Pause the animation in progress. Playback will resume from the current
    * position
    */
    AnimationController.prototype.pause = function () {
        apply_all(this.channels, "pause");
    };

    /* Play the animation as queued. */
    AnimationController.prototype.play = function () {
        apply_all(this.channels, "play");
    };

    /* Update the animation controller's channels.
     */
    AnimationController.prototype.update = function (frame_count) {
        if (frame_count === undefined) {
            frame_count = 1;
        }

        var k;

        for (k in this.channels) {
            if (this.channels.hasOwnProperty(k)) {
                frame_count = this.channels[k].update(frame_count);
            }
        }

        return frame_count;
    };

    module.AnimationChannel = AnimationChannel;
    module.FBFAnimationChannel = FBFAnimationChannel;
    module.ColorAnimationChannel = ColorAnimationChannel;
    module.AnimationController = AnimationController;

    module.status = "loaded";
    module.version = "0.4.0";
}(window, window.SixLoves_AnimationFramework));
