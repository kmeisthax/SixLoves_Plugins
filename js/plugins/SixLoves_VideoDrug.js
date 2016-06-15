/*jslint nomen:false, es5:true*/
/*global console*/

/*:
 * @author David Wendt (fantranslation.org)
 * @plugindesc Provides hblank/copper-style battle backgrounds. v0.4.0
 *
 * @help
 *
 *      Provides battle backgrounds that wave and move around like an HBlank/
 * Amiga Copper effect. Alternatively, if you don't know what that is, think of
 * EarthBound.
 */


window.SixLoves_VideoDrug = window.SixLoves_VideoDrug || {};

(function (root, module) {
    "use strict";

    var force_frame_adaptive, Easings, AnimationChannel, ColorAnimationChannel, AnimationController;

    if (root.SixLoves_AnimationFramework === undefined) {
        console.error("SixLoves_VideoDrug requires SixLoves_AnimationFramework in order to work. Sorry!");
        module.status = "dependency missing";
        return;
    } else {
        Easings = root.SixLoves_AnimationFramework.Easings;
        AnimationChannel = root.SixLoves_AnimationFramework.AnimationChannel;
        ColorAnimationChannel = root.SixLoves_AnimationFramework.ColorAnimationChannel;
        AnimationController = root.SixLoves_AnimationFramework.AnimationController;
    }

    if (root.SixLoves_Responsive === undefined) {
        console.warn("SixLoves_VideoDrug works great with SixLoves_Responsive's high framerate support!");
        force_frame_adaptive = function (dontcare, func, that) {
            func.apply(that);
        };
    } else {
        force_frame_adaptive = root.SixLoves_Responsive.force_frame_adaptive;
    }

    /**
     * Implements a WebGL fragment filter that displaces texture coordinates on
     * a per-pixel basis according to a set of parameters. This effectively
     * emulates hblank effects.
     */
    function SineDispFilter() {
        root.PIXI.AbstractFilter.call(this);

        this.passes = [this];

        this.uniforms = {
            dimensions: {type: '4fv', value: [0, 0, 0, 0]}, //width, height, x, y
            shift: {type: '1f', value: 0.0},
                //Adjust the resulting wave.
                //Value in radians, from 0 to Math.PI * 2. Larger or smaller
                //values are accepted, but wrap to that range.
            periodicity: {type: '1f', value: 10},
                //in pixels, determines the length of the wave
            strength: {type: '4fv', value: [1, 1, 1, 1]}
                //in pixels, determines the max sin displacement
                //parameter names are dirX, dirY, dispX, dispY
                //dir* parameters determine the direction the wave moves
                //disp* parameters determine how the wave displaces pixels
        };

        this.fragmentSrc = [
            "precision mediump float;\
varying vec2 vTextureCoord;\
varying vec4 vColor;\
\
uniform sampler2D uSampler;\
uniform float shift;\
uniform float periodicity;\
uniform vec4 dimensions;\
uniform vec4 strength;\
\
void main(void) {\
    vec2 newCoord = vTextureCoord * dimensions.xy;\
    float normalizedPos = dot(newCoord.xy, strength.xy) / periodicity;\
    vec2 displacement = sin(normalizedPos + shift) * strength.zw;\
    vec2 displaced = clamp((newCoord + displacement) / dimensions.xy, vec2(0,0), vec2(1,1));\
    gl_FragColor = texture2D(uSampler, displaced);\
}"
        ];

        this.channels = {};

        this.channels.shift = new AnimationChannel(this, "shift");
        this.channels.periodicity = new AnimationChannel(this, "periodicity");
        this.channels.directionX = new AnimationChannel(this, "directionX");
        this.channels.directionY = new AnimationChannel(this, "directionY");
        this.channels.displacementX = new AnimationChannel(this, "displacementX");
        this.channels.displacementY = new AnimationChannel(this, "displacementY");

        this.controller = new AnimationController();
        this.controller.import_channels(this);
    }

    SineDispFilter.prototype = Object.create(root.PIXI.AbstractFilter.prototype);
    SineDispFilter.prototype.constructor = SineDispFilter;

    Object.defineProperty(SineDispFilter.prototype, 'shift', {
        get: function () { return this.uniforms.shift.value; },
        set: function (val) { this.uniforms.shift.value = val; this.dirty = true; }
    });

    Object.defineProperty(SineDispFilter.prototype, 'periodicity', {
        get: function () { return this.uniforms.periodicity.value; },
        set: function (val) { this.uniforms.periodicity.value = val; this.dirty = true; }
    });

    Object.defineProperty(SineDispFilter.prototype, 'directionX', {
        get: function () { return this.uniforms.strength.value[0]; },
        set: function (val) { this.uniforms.strength.value[0] = val; this.dirty = true; }
    });

    Object.defineProperty(SineDispFilter.prototype, 'directionY', {
        get: function () { return this.uniforms.strength.value[1]; },
        set: function (val) { this.uniforms.strength.value[1] = val; this.dirty = true; }
    });

    Object.defineProperty(SineDispFilter.prototype, 'displacementX', {
        get: function () { return this.uniforms.strength.value[2]; },
        set: function (val) { this.uniforms.strength.value[2] = val; this.dirty = true; }
    });

    Object.defineProperty(SineDispFilter.prototype, 'displacementY', {
        get: function () { return this.uniforms.strength.value[3]; },
        set: function (val) { this.uniforms.strength.value[3] = val; this.dirty = true; }
    });

    /**
     * Implements a WebGL fragment filter that scales texture coordinates on
     * a per-pixel basis according to a set of parameters. This effectively
     * emulates hblank effects with arbitrary affine transforms (Mode 7).
     */
    function SineScaleFilter() {
        root.PIXI.AbstractFilter.call(this);

        this.passes = [this];

        this.uniforms = {
            dimensions: {type: '4fv', value: [0, 0, 0, 0]}, //width, height, x, y
            shift: {type: '1f', value: 0.0},
                //Adjust the resulting wave.
                //Value in radians, from 0 to Math.PI * 2. Larger or smaller
                //values are accepted, but wrap to that range.
            periodicity: {type: '1f', value: 10},
                //in pixels, determines the length of the wave
            direction: {type: '2fv', value: [1, 1]},
                //in pixels, determines the direction the wave moves
                //parameter names are dirX, dirY
            strength: {type: '4fv', value: [1, 1, 1, 1]}
                //in pixels, determines the max sin scale
                //parameter names are lowX, lowY, hiX, hiY
                //Scaling will vary from low to high
        };

        this.fragmentSrc = [
            "precision mediump float;\
varying vec2 vTextureCoord;\
varying vec4 vColor;\
\
uniform sampler2D uSampler;\
uniform float shift;\
uniform float periodicity;\
uniform vec4 dimensions;\
uniform vec2 direction;\
uniform vec4 strength;\
\
void main(void) {\
    vec2 newCoord = (vTextureCoord - vec2(0.5)) * dimensions.xy;\
    float normalizedPos = dot(newCoord.xy, direction.xy) / periodicity;\
    vec2 sine = (sin(normalizedPos + shift) + vec2(1.0)) / vec2(2.0);\
    vec2 scale = sine * (strength.zw - strength.xy) + strength.xy;\
    vec2 displaced = (newCoord / scale) / dimensions.xy + vec2(0.5);\
    gl_FragColor = texture2D(uSampler, displaced);\
}"
        ];

        this.channels = {};

        this.channels.shift = new AnimationChannel(this, "shift");
        this.channels.periodicity = new AnimationChannel(this, "periodicity");
        this.channels.directionX = new AnimationChannel(this, "directionX");
        this.channels.directionY = new AnimationChannel(this, "directionY");
        this.channels.scaleLowX = new AnimationChannel(this, "scaleLowX");
        this.channels.scaleLowY = new AnimationChannel(this, "scaleLowY");
        this.channels.scaleHighX = new AnimationChannel(this, "scaleHighX");
        this.channels.scaleHighY = new AnimationChannel(this, "scaleHighY");

        this.controller = new AnimationController();
        this.controller.import_channels(this);
    }

    SineScaleFilter.prototype = Object.create(root.PIXI.AbstractFilter.prototype);
    SineScaleFilter.prototype.constructor = SineScaleFilter;

    Object.defineProperty(SineScaleFilter.prototype, 'shift', {
        get: function () { return this.uniforms.shift.value; },
        set: function (val) { this.uniforms.shift.value = val; this.dirty = true; }
    });

    Object.defineProperty(SineScaleFilter.prototype, 'periodicity', {
        get: function () { return this.uniforms.periodicity.value; },
        set: function (val) { this.uniforms.periodicity.value = val; this.dirty = true; }
    });

    Object.defineProperty(SineScaleFilter.prototype, 'directionX', {
        get: function () { return this.uniforms.direction.value[0]; },
        set: function (val) { this.uniforms.direction.value[0] = val; this.dirty = true; }
    });

    Object.defineProperty(SineScaleFilter.prototype, 'directionY', {
        get: function () { return this.uniforms.direction.value[1]; },
        set: function (val) { this.uniforms.direction.value[1] = val; this.dirty = true; }
    });

    Object.defineProperty(SineScaleFilter.prototype, 'scaleLowX', {
        get: function () { return this.uniforms.strength.value[0]; },
        set: function (val) { this.uniforms.strength.value[0] = val; this.dirty = true; }
    });

    Object.defineProperty(SineScaleFilter.prototype, 'scaleLowY', {
        get: function () { return this.uniforms.strength.value[1]; },
        set: function (val) { this.uniforms.strength.value[1] = val; this.dirty = true; }
    });

    Object.defineProperty(SineScaleFilter.prototype, 'scaleHighX', {
        get: function () { return this.uniforms.strength.value[2]; },
        set: function (val) { this.uniforms.strength.value[2] = val; this.dirty = true; }
    });

    Object.defineProperty(SineScaleFilter.prototype, 'scaleHighY', {
        get: function () { return this.uniforms.strength.value[3]; },
        set: function (val) { this.uniforms.strength.value[3] = val; this.dirty = true; }
    });

    /**
     * A PaletteShiftFilter maps colors on color line A..B to color line C..D.
     *
     * Specifically, the color is projected onto the line A..B, and if it's
     * within a minimum distance from the line, we calculate the percentage (T)
     * along the line and instead output another color at the same percentage
     * along the line C..D.
     *
     * A shift parameter is also available to allow shifting the resulting value
     * along C..D.
     *
     * Color values are interpreted as RGBA 4-vectors in the range of [0, 1].
     * That is, when calculating your palette shifts, you need to divide your
     * color values by 255 (except for alpha) and either only apply this filter
     * to non-transparent portions of your image, or be aware of applying this
     * palette shift on a transparent area of the image.
     */
    function PaletteShiftFilter() {
        root.PIXI.AbstractFilter.call(this);

        this.passes = [this];

        this.uniforms = {
            colorA: {type: "4fv", value: [0, 0, 0, 0]},
            colorB: {type: "4fv", value: [0, 0, 0, 0]},
            colorC: {type: "4fv", value: [0, 0, 0, 0]},
            colorD: {type: "4fv", value: [0, 0, 0, 0]},
            colorE: {type: "4fv", value: [0, 0, 0, 0]},
            colorDStop: {type: "1f", value: 0.5},
            tolerance: {type: "1f", value: 0.5 / 255},
            shift: {type: "1f", value: 0},
        };

        this.fragmentSrc = ["precision mediump float;\
  varying vec2 vTextureCoord;\
  varying vec4 vColor;\
  \
  uniform sampler2D uSampler;\
  uniform vec4 colorA;\
  uniform vec4 colorB;\
  uniform vec4 colorC;\
  uniform vec4 colorD;\
  uniform vec4 colorE;\
  uniform float colorDStop;\
  uniform float tolerance;\
  uniform float shift;\
  \
  void main(void) {\
      vec4 origColor = texture2D(uSampler, vTextureCoord);\
      vec4 origColorFromA = origColor - colorA;\
      vec4 colorBFromA = colorB - colorA;\
      vec4 projColor = (dot(origColorFromA, colorBFromA) / dot(colorBFromA, colorBFromA)) * colorBFromA;\
      float colDist = distance(origColorFromA, projColor);\
      float tValue = mod(distance(vec4(0.0), projColor) / distance(vec4(0.0), colorBFromA) + shift, 1.0);\
      vec4 colorDiff, newColor;\
      if (tValue < colorDStop) {\
          tValue = tValue / colorDStop;\
          colorDiff = colorD - colorC;\
          newColor = colorC + colorDiff * tValue;\
      } else {\
          tValue = (tValue - colorDStop) / (1.0 - colorDStop);\
          colorDiff = colorE - colorD;\
          newColor = colorD + colorDiff * tValue;\
      }\
      if (colDist < tolerance) {\
          gl_FragColor = newColor * origColor.a;\
      } else {\
          gl_FragColor = origColor;\
      }\
  }"
        ];

        this.channels = {};

        this.channels.colorA = new ColorAnimationChannel(this, "colorA");
        this.channels.colorB = new ColorAnimationChannel(this, "colorB");
        this.channels.colorC = new ColorAnimationChannel(this, "colorC");
        this.channels.colorD = new ColorAnimationChannel(this, "colorD");
        this.channels.colorE = new ColorAnimationChannel(this, "colorE");
        this.channels.colorDStop = new AnimationChannel(this, "colorDStop");
        this.channels.tolerance = new AnimationChannel(this, "tolerance");
        this.channels.shift = new AnimationChannel(this, "shift");

        this.controller = new AnimationController();
        this.controller.import_channels(this);
    }

    Object.defineProperty(PaletteShiftFilter.prototype, 'colorA', {
        get: function () { return this.uniforms.colorA.value; },
        set: function (val) { this.uniforms.colorA.value = val; this.dirty = true; }
    });

    Object.defineProperty(PaletteShiftFilter.prototype, 'colorB', {
        get: function () { return this.uniforms.colorB.value; },
        set: function (val) { this.uniforms.colorB.value = val; this.dirty = true; }
    });

    Object.defineProperty(PaletteShiftFilter.prototype, 'colorC', {
        get: function () { return this.uniforms.colorC.value; },
        set: function (val) { this.uniforms.colorC.value = val; this.dirty = true; }
    });

    Object.defineProperty(PaletteShiftFilter.prototype, 'colorD', {
        get: function () { return this.uniforms.colorD.value; },
        set: function (val) { this.uniforms.colorD.value = val; this.dirty = true; }
    });

    Object.defineProperty(PaletteShiftFilter.prototype, 'colorE', {
        get: function () { return this.uniforms.colorE.value; },
        set: function (val) { this.uniforms.colorE.value = val; this.dirty = true; }
    });

    Object.defineProperty(PaletteShiftFilter.prototype, 'colorDStop', {
        get: function () { return this.uniforms.colorDStop.value; },
        set: function (val) { this.uniforms.colorDStop.value = val; this.dirty = true; }
    });

    Object.defineProperty(PaletteShiftFilter.prototype, 'tolerance', {
        get: function () { return this.uniforms.tolerance.value; },
        set: function (val) { this.uniforms.tolerance.value = val; this.dirty = true; }
    });

    Object.defineProperty(PaletteShiftFilter.prototype, 'shift', {
        get: function () { return this.uniforms.shift.value; },
        set: function (val) { this.uniforms.shift.value = val; this.dirty = true; }
    });

    /**
     * Given a description of an effect, construct a suitable filter chain to
     * implement it.
     *
     * An effect description is an object structured like so:
     *
     *   {
     *     "#type": //Name of a class in the VideoDrug module.
     *              //Should be an effect.
     *     "#default_animation": //Name of the animation data to be loaded by
     *                           //default.
     *     "idle": //"idle" animation data, to be passed into the effect's
     *             //controller's import_animation method. Key must match what
     *             //is specified in #default_animation.
     *     //Additional animations may be specified here and will be available
     *     //to event scripts by the same name used here.
     *   }
     *
     * The data handed to this function is expected to be an array of zero or
     * more of these effect descriptions.
     *
     * Returns an object containing both the fully constructed filter chain on
     * the "filters" property as well as an animation controller on
     * "controller".
     */
    function construct_filter_chain(effect_description) {
        var i, k, default_anim, filter, filters = [], controller = new AnimationController();

        for (i = 0; i < effect_description.filters.length; i += 1) {
            default_anim = effect_description.filters[i]["#default_animation"];
            filter = new module[effect_description.filters[i]["#type"]];

            for (k in effect_description.filters[i]) {
                if (effect_description.filters[i].hasOwnProperty(k) && k[0] !== "#") {
                    filter.controller.import_animation(effect_description.filters[i][k], k);
                }
            }

            filter.controller.transition(default_anim);
            filter.controller.play();
            filters.push(filter);

            controller.import_channels(filter.controller, "stage_" + i);
        }

        return {
            filters: filters,
            controller: controller
        };
    }

    /* Create our own data manager class.
     *
     * This particular DataManager, while patterned like the RPGMaker DataManger
     * is a bit different. It accepts a directory prefix which is used to
     * namespace data lookups. It also accepts an indexName parameter which
     * specifies a data file which must always be loaded.
     */
    function DataManager(prefix, indexName) {
        this.prefix = prefix;

        this.effects = {};
        this.activeXHRs = 0;

        this.indexName = indexName;
    }

    /* Load the list of effect data mappings.
     */
    DataManager.prototype.loadEffectIndex = function () {
        var xhr = new XMLHttpRequest(),
            url = 'data/' + this.prefix + this.indexName;
        xhr.open('GET', url);
        xhr.overrideMimeType('application/json');
        xhr.onload = function() {
            if (xhr.status < 400) {
                this.indexData = JSON.parse(xhr.responseText);
            }
        }.bind(this);

        xhr.send();
    };

    /* Load an effect data file.
     *
     * Resulting data will be constructed into a filter effect chain and stored
     * in this.effects for later use. See construct_filter_chain for more info
     * about how to use the resulting object.
     */
    DataManager.prototype.loadEffect = function(name) {
        var xhr = new XMLHttpRequest(),
            url = 'data/' + this.prefix + name + ".json";
        xhr.open('GET', url);
        xhr.overrideMimeType('application/json');
        xhr.onload = function() {
            if (xhr.status < 400) {
                this.effects[name] = construct_filter_chain(JSON.parse(xhr.responseText));
            }
            this.activeXHRs -= 1;
        }.bind(this);

        xhr.send();
        this.activeXHRs += 1;
    };

    DataManager.prototype.isReady = function () {
        return this.indexData !== undefined;
    };

    DataManager.prototype.isEffectLoaded = function (name) {
        return this.effects[name] !== undefined;
    };

    /* Load effect index on boot.
     */
    root.Scene_Boot.prototype.create = (function (old_impl) {
        return function () {
            old_impl.apply(this, arguments);
            module.$dataEffects.loadEffectIndex();
        }
    }(root.Scene_Boot.prototype.create));

    /* Block scene until our effect index is loaded.
     */
    root.Scene_Boot.prototype.isReady = (function (old_impl) {
        return function () {
            return old_impl.apply(this, arguments) && module.$dataEffects.isReady();
        }
    }(root.Scene_Boot.prototype.isReady));

    /* Load effect data when battle starts.
     */
    root.Scene_Battle.prototype.create = (function (old_impl) {
        return function () {
            var bb1Name, bb2Name;

            old_impl.apply(this, arguments);

            bb1Name = this._spriteset.battleback1Name();
            bb2Name = this._spriteset.battleback2Name();

            this._SixLoves__VideoDrug_back1EffectName = module.$dataEffects.indexData.back1Mapping[bb1Name];
            this._SixLoves__VideoDrug_back2EffectName = module.$dataEffects.indexData.back2Mapping[bb2Name];

            module.$dataEffects.loadEffect(this._SixLoves__VideoDrug_back1EffectName);
            module.$dataEffects.loadEffect(this._SixLoves__VideoDrug_back2EffectName);
        }
    }(root.Scene_Battle.prototype.create));

    /* Block scene until our effect index is loaded.
     */
    root.Scene_Battle.prototype.isReady = (function (old_impl) {
        return function () {
            return old_impl.apply(this, arguments) && module.$dataEffects.isReady() && this._spriteset.isReady();
        }
    }(root.Scene_Battle.prototype.isReady));

    /* Add an isReady method to Spriteset_Battle.
     *
     * This probably isn't the best idea but I need to block loading until we
     * have our filter descriptions.
     */
    root.Spriteset_Battle.prototype.isReady = (function (old_impl) {
        if (old_impl === undefined) {
            old_impl = function () {
                return true;
            };
        }
        return function () {
            var ready = old_impl.apply(this, arguments),
                name1 = this._SixLoves__VideoDrug_back1EffectName,
                name2 = this._SixLoves__VideoDrug_back2EffectName;

            if (name1 !== undefined) {
                ready = ready && module.$dataEffects.isEffectLoaded(name1);
            }

            if (name2 !== undefined) {
                ready = ready && module.$dataEffects.isEffectLoaded(name2);
            }

            if (ready) {
                this._SixLoves__VideoDrug_controller = new AnimationController();

                //Another hack: Install the filters at the last possible moment
                //before updates begin.
                if (name1 !== undefined) {
                    this._SixLoves__VideoDrug_back1.innerSprite.filters = module.$dataEffects.effects[name1].filters;
                    this._SixLoves__VideoDrug_controller.import_channels(module.$dataEffects.effects[name1].controller, "back1");
                }

                if (name2 !== undefined) {
                    this._SixLoves__VideoDrug_back2.innerSprite.filters = module.$dataEffects.effects[name2].filters;
                    this._SixLoves__VideoDrug_controller.import_channels(module.$dataEffects.effects[name2].controller, "back2");
                }

                this._SixLoves__VideoDrug_controller.transition("idle");
                this._SixLoves__VideoDrug_controller.play();

                //Finally, ensure our render target is sized correctly
                this.layout();
            }

            return ready;
        }
    }(root.Spriteset_Battle.prototype.isReady));

    /** Create and apply our "Video Drug Filter" on battle back 1.
     */
    root.Spriteset_Battle.prototype.createBattleback = (function (old_impl) {
        return function () {
            var bb1Name, bb2Name;
            old_impl.apply(this, arguments);

            //Rip out the battleback images and put them in other sprites.
            //this._battleField.removeChild(this._back1Sprite);
            //this._battleField.removeChild(this._back2Sprite);

            this._SixLoves__VideoDrug_back1 = {
                "rt": new root.PIXI.RenderTexture(this._back1Sprite.bitmap.width, this._back1Sprite.bitmap.height, undefined, undefined, this._back1Sprite.bitmap.resolution)
            };
            this._SixLoves__VideoDrug_back1.innerChildSprite = new root.Sprite();
            this._SixLoves__VideoDrug_back1.innerChildSprite.bitmap = this._back1Sprite.bitmap;
            this._SixLoves__VideoDrug_back1.innerChildSprite.anchor.x = 0.5;
            this._SixLoves__VideoDrug_back1.innerChildSprite.anchor.y = 0.5;
            this._SixLoves__VideoDrug_back1.innerSprite = new root.PIXI.DisplayObjectContainer();
            this._SixLoves__VideoDrug_back1.innerSprite.addChild(this._SixLoves__VideoDrug_back1.innerChildSprite);

            this._back1Sprite.texture = this._SixLoves__VideoDrug_back1.rt;

            this._SixLoves__VideoDrug_back2 = {
                "rt": new root.PIXI.RenderTexture(this._back2Sprite.bitmap.width, this._back2Sprite.bitmap.height, undefined, undefined, this._back2Sprite.bitmap.resolution)
            };
            this._SixLoves__VideoDrug_back2.innerChildSprite = new root.Sprite();
            this._SixLoves__VideoDrug_back2.innerChildSprite.bitmap = this._back2Sprite.bitmap;
            this._SixLoves__VideoDrug_back2.innerChildSprite.anchor.x = 0.5;
            this._SixLoves__VideoDrug_back2.innerChildSprite.anchor.y = 0.5;
            this._SixLoves__VideoDrug_back2.innerSprite = new root.PIXI.DisplayObjectContainer();
            this._SixLoves__VideoDrug_back2.innerSprite.addChild(this._SixLoves__VideoDrug_back2.innerChildSprite);

            this._back2Sprite.texture = this._SixLoves__VideoDrug_back2.rt;

            bb1Name = this.battleback1Name();
            bb2Name = this.battleback2Name();

            this._SixLoves__VideoDrug_back1EffectName = module.$dataEffects.indexData.back1Mapping[bb1Name];
            this._SixLoves__VideoDrug_back2EffectName = module.$dataEffects.indexData.back2Mapping[bb2Name];

            if (this._SixLoves__VideoDrug_back1EffectName !== undefined) {
                module.$dataEffects.loadEffect(this._SixLoves__VideoDrug_back1EffectName);
            }

            if (this._SixLoves__VideoDrug_back1EffectName !== undefined) {
                module.$dataEffects.loadEffect(this._SixLoves__VideoDrug_back2EffectName);
            }
        };
    }(root.Spriteset_Battle.prototype.createBattleback));

    /* Update the layout method (if it exists) to change our render texture
     * size as well.
     */
    root.Spriteset_Battle.prototype.layout = (function (old_impl) {
        return function () {
            var w, h, r;

            if (old_impl) {
                old_impl.apply(this, arguments);
            }

            w = this._back1Sprite.bitmap.width;
            h = this._back1Sprite.bitmap.height;
            r = this._back1Sprite.bitmap.baseTexture.resolution;

            //So, uh, real talk here: there's a massive bug in RenderTexture
            //which causes it to miscalculate it's width/height because it
            //forwards them to the Texture constructor, resulting in the res
            //multiplier being done twice and the projection data being totally
            //wrong. This is a bad workaround for it. I could do better if I
            //stuck it in Responsive with the other PIXIfixes.
            this._SixLoves__VideoDrug_back1.rt.destroy();
            this._SixLoves__VideoDrug_back1.rt = new root.PIXI.RenderTexture(w, h, undefined, undefined, r);
            this._SixLoves__VideoDrug_back1.rt.width = w;
            this._SixLoves__VideoDrug_back1.rt.height = h;
            this._SixLoves__VideoDrug_back1.rt.projection.x = w / 2;
            this._SixLoves__VideoDrug_back1.rt.projection.y = h / -2;
            this._SixLoves__VideoDrug_back1.innerChildSprite.move(w / 2, h / 2, w, h);
            this._back1Sprite.texture = this._SixLoves__VideoDrug_back1.rt;

            w = this._back2Sprite.bitmap.width;
            h = this._back2Sprite.bitmap.height;
            r = this._back2Sprite.bitmap.baseTexture.resolution;

            this._SixLoves__VideoDrug_back2.rt.destroy();
            this._SixLoves__VideoDrug_back2.rt = new root.PIXI.RenderTexture(w, h, undefined, undefined, r);
            this._SixLoves__VideoDrug_back2.rt.width = w;
            this._SixLoves__VideoDrug_back2.rt.height = h;
            this._SixLoves__VideoDrug_back2.rt.projection.x = w / 2;
            this._SixLoves__VideoDrug_back2.rt.projection.y = h / -2;
            this._SixLoves__VideoDrug_back2.innerChildSprite.move(w / 2, h / 2, w, h);
            this._back2Sprite.texture = this._SixLoves__VideoDrug_back2.rt;
        };
    }(root.Spriteset_Battle.prototype.layout));

    /** Update the video drug filter's time value.
     */
    root.Spriteset_Battle.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Spriteset_Base.prototype.update, this);
        this.updateActors();
        this.updateBattleback();

        if (this._SixLoves__VideoDrug_controller !== undefined) {
            frameCount = this._SixLoves__VideoDrug_controller.update(frameCount);
        }

        this._SixLoves__VideoDrug_back1.rt.render(this._SixLoves__VideoDrug_back1.innerSprite, undefined, true);
        this._SixLoves__VideoDrug_back2.rt.render(this._SixLoves__VideoDrug_back2.innerSprite, undefined, true);

        return frameCount;
    };

    root.Spriteset_Battle.prototype.update.frame_adaptive = true;

    module.SineDispFilter = SineDispFilter;
    module.SineScaleFilter = SineScaleFilter;
    module.PaletteShiftFilter = PaletteShiftFilter;
    module.DataManager = DataManager;
    module.$dataEffects = new DataManager("SixLoves_VideoDrug/", "EffectList.json");
    module.construct_filter_chain = construct_filter_chain;

    module.status = "loaded";
    module.version = "0.4.0";
}(window, window.SixLoves_VideoDrug));
