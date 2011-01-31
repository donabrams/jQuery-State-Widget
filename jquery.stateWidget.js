(function($) {
    $.udel = $.udel || {};

    /** Start of API **/
    $.udel.api = $.udel.api || {};
    //
    // This is a stateWidget: a widget that exists by transitioning between 
    // states.
    //
    // It also supports synchronous and synchronous data get/saving.
    //
    // Usually, implementations will also throw an event when a state starts 
    // to transition and completes a transition in addition to the 
    // changingState flag. This is not required, but recommended to give 
    // outside applications hooks.
    //
    $.udel.api.stateWidget = {
        //
        // This function saves the state of the widget to
        // a non-local store. When implemented, this widget
        // should be able to restore to this state.
        //    
        // Keep this synchronous (you can use synchronous ajax requests)
        //
        saveState: function() {},
        // You don't have to pass in data, but if you do it overrides and mixes
        // in with the current data.
        // Returns a copy and does not modify existing data.
        getData: function(dataIn) {
            var data = {};
            $.extend(true, data, this.data, dataIn);
            return data;
        },
        saveData: function(data) {
            this.data = data;
        },
        //see store for callback info
        callStore: function(callback, data, storeName) {
            if (this.stores && this.stores[storeName]) {
                return this.stores[storeName].fetch(callback, data);
            }
        },
        doAction: function(action, dataIn) {
            // If currently changing state, ignore other requests to change state.
            // This means if changing state during state loading, you must 
            //  call the callback first!
            if (!this.changingState) {
                this.changingState = true;
                var that = this;
                var callback = function() {
                    that.changingState = false;
                };
                var gotoNextState = function(nextState) {
                    if (nextState) {
                        that.currentState = nextState;
                        nextState.loadState(callback, that, dataIn);
                    }
                    else {
                        callback();
                    }
                };
                if (this.currentState) {
                    this.currentState.getNextState(gotoNextState, this, action);
                } else if (this.initialState) {
                    gotoNextState(this.initialState);
                } else if (this.initialStateName && this.states && this.states[this.initialStateName]) {
                    gotoNextState(this.state[this.initialStateName]);
                }
            }
        }
    };
    //
    // A state a widget can be in.
    //
    // Define the stack to be executed when changing state by
    //  setting the function stack array. this.funcionStack should 
    //  be a list of functionNames to be executed in order via callbacks.
    //  
    //
    $.udel.api.state = {
        //
        // This is not usually overloaded.
        //
        // Instead make a list of the functions in an array called functionStack.
        // The elements of the list can either be functions (executed on the state's scope)
        //  or strings that map to methods on the state.
        //
        loadState: function(callback, widget, data) {
            var lastFunc = callback;
            if (this.functionStack && this.functionStack.length > 0) {
                var stack = this.functionStack.slice(0).reverse();
                var that = this;
                $.each(stack, function(i) {
                    var f = lastFunc;
                    lastFunc = function() {
                        if ($.isFunction(stack[i])) {
                            stack[i].call(that, f, widget, data);
                        } else {
                            that[stack[i]](f, widget, data);
                        }
                    };
                });
            }
            if (lastFunc) {
                lastFunc();
            }
        },
        //
        // This is usually overloaded (unless a widget can transition 
        //  to ANY state.
        //
        getNextState: function(callback, widget, action) {
            callback(this._getNextState(widget, action));
        },
        //
        // Synchronous method for getting the next state, wrapped by
        //  getNextState
        //
        _getNextState: function(widget, action) {
            return widget.states[action];
        }
    };
    //
    // This represents a store-- an asynchronous source and destination
    // for data.
    //
    $.udel.api.store = {
        //
        // Usually overloaded (default implementation is a successful mirror).
        //
        // This fetches data from the store (done differently by 
        // different implementations)
        // after sending some data to it (a query or an update).
        // 
        // After the store responds, the callback is called like so: 
        // callback(success/boolean, response/{});
        // 
        //
        fetch: function(callback, data) {
            var toRet = data;
            if (callback) {
                callback(true, toRet);
            }
        }
    }; /** End of API **/

    /** Start UD implementations **/
    //
    // This is a udel store implementation.
    // Pretty straightforward url based implementation with some additional hooks.
    // 
    // args can include/override anything, but esp:
    //  - url
    //  - preformatter (formats data before request)
    //  - postformatter (formats data after response)
    //  - method (default is POST)
    //
    $.udel.store = function(args) {
        $.extend(true, this, $.udel.api.store);
        this.method = "POST";
        this.fetch = function(callback, data) {
            var that = this;
            var dataReceiver = function(success, data) {
                if (callback) {
                    if (that.postformatter) {
                        data = that.postformatter(data);
                    }
                    callback(success, data);
                }
            };
            if (this.preformatter) {
                data = this.preformatter(data);
            }
            if (this.url) {
                $.ajax({
                    'data': $.flattenObject(data, null, null, {
                        nullsAsEmptyString: true
                    }),
                    url: that.url,
                    type: that.method,
                    success: function(responseData) {
                        dataReceiver(true, responseData);
                    },
                    error: function(responseData) {
                        dataReceiver(false, responseData);
                    }
                });
            } else {
                dataReceiver(true, data);
            }
        };
        $.extend(true, this, args);
    };
    //
    // This is the udel state implementation.
    // Anything in args overrides anything here.
    //
    // templateName/String and actions/{} should probably be defined in args.
    //
    // widget.states and widget.templates should be defined as follows:
    //
    // It has a couple of conventions that are nice:
    // 1) It assumes the widget has a map of names->states called states.
    // 2) If widget.states maps an action to a string,
    //   it assumes its the action that matches that string in the widget.
    // 3) If widget.states maps an action to a function,
    //   it assumes its a synchronous function that takes a widget and returns a state name.
    // 4) It assumes the widget has a map of names->templates called templates.
    //   These templates are '$.udel.template's.
    // 
    $.udel.state = function(args) {
        $.extend(true, this, $.udel.api.state);
        //
        // Define the function stack for $.udel.api.state
        //
        this.functionStack = ['init', 'loadTemplate', 'onTemplateLoad'];
        //
        // Initialize the widget before the template loads.
        // If transitioning to another state, this rarely is the place--
        //  only transition here if you're not waiting for a fetch.
        //
        this.init = function(callback, widget, initialData) {
            if (this._init) {
                this._init(widget, initialData);
            }
            callback();
        };
        //
        // Get the template determined by this.templateName
        //  stored on the widget.  Then, apply the template
        //  to the widgetElement with the widget data.
        //
        this.keepPreviousTemplate = false;
        this.loadTemplate = function(callback, widget, data, templateName) {
            var template = widget.templates[templateName ? templateName : this.templateName];
            template.applyTemplate(widget.getData(), widget.element, callback, this.keepPreviousTemplate);
        };
        //
        // Decorate the widget after the template loads.
        // If transitioning to another state, this is typically the place
        //  (esp. if that transition is based on fetched data).
        //
        this.onTemplateLoad = function(callback, widget) {
            if (this._onTemplateLoad) {
                this._onTemplateLoad(widget);
            }
            callback();
        };
        //
        // This sychronous getNextState uses this.actions
        //  to discover the name of the state mapping to 
        //  the name of a state in this widget.
        // 
        // The action can be either a string or an synchronous
        //  function that returns a string (executed on state scope).
        //
        this._getNextState = function(widget, action) {
            var nextState = this.actions[action];
            if (!nextState) {
                return null;
            }
            if ($.isFunction(nextState)) {
                //assumes the nextState function is synchronous
                nextState = nextState(widget);
            }
            return widget.states[nextState];
        };
        $.extend(true, this, args);
    };
    //
    // Now this is the wonderful $.udel.stateWidget complete with a ton of conventions.
    // 
    // 
    var stateWidget = $.extend(true, {}, $.udel.api.stateWidget, {
        _create: function() {
            // This registers with $.udel.factory
            if (this._registerInstance) {
                this._registerInstance();
            }
            // This actually creates the widget
            this._stateWidgetCreate.apply(this, arguments);
        },
        _stateWidgetCreate: function() {
            this._initStores();
            this._initTemplates();
            this._initStates();
            var that = this;
            $(window).unload(function() {
                that.saveState();
            });
            this.doAction(null, this.options.initialData);
        },
        //
        // Set up this.stores and this.defaultStore via _getStore()
        //
        _initStores: function() {
            var stores = {};
            var defaultStore = null;
            if (this.options.stores) {
                var that = this;
                $.each(this.options.stores, function(i) {
                    stores[i] = that._getStore(that.options.stores[i]);
                    if (!defaultStore || that.options.stores[i].defaultStore) {
                        defaultStore = stores[i];
                    }
                });
            }
            this.stores = stores;
            if (defaultStore) {
                this.defaultStore = defaultStore;
            }
        },
        //
        // Set up this.templates via _getTemplate()
        //
        _initTemplates: function() {
            var templates = {};
            if (this.options.templates) {
                var that = this;
                $.each(this.options.templates, function(i) {
                    templates[i] = that._getTemplate(that.options.templates[i]);
                });
            }
            this.templates = templates;
        },
        //
        // Set up this.states and this.initialState via _getState()
        //
        _initStates: function() {
            var states = {};
            var initialState;
            if (this.options.states) {
                var that = this;
                $.each(this.options.states, function(i) {
                    states[i] = that._getState(that.options.states[i]);
                    if (!initialState || states[i].initialState) {
                        initialState = states[i];
                    }
                });
            }
            this.states = states;
            if (initialState) {
                this.initialState = initialState;
            }
        },
        //
        // Widget store
        // Convention: if args is a string, that string is the url.
        // Also, if a storeBaseUrl is provided and the url does not 
        //  have http at the front, the url is appended to the storeBaseUrl.
        //
        _getStore: function(argsIn) {
            var args = argsIn;
            if (typeof argsIn === "string") {
                args = {
                    url: argsIn
                };
            }
            if (this.options.storeBaseUrl && args.url && (args.url.substring(0, 4) != "http")) {
                args.url = this.options.storeBaseUrl + args.url;
            }
            return new $.udel.store(args);
        },
        //
        // Widget template
        // Convention: if args is a string, that string is the url.
        // Also, if a templateBaseUrl is provided and the url does not 
        //  have http at the front, the url is appended to the templateBaseUrl.
        //
        _getTemplate: function(argsIn) {
            var args = argsIn;
            if (typeof argsIn === "string") {
                args = {
                    url: argsIn
                };
            }
            if (this.options.templateBaseUrl && args.url && (args.url.substring(0, 4) != "http")) {
                args.url = this.options.templateBaseUrl + args.url;
            }
            return new $.udel.template(args);
        },
        //
        // Widget state
        // Convention: if args is a string, that string is the template name.
        //
        _getState: function(argsIn) {
            var args = argsIn;
            if (typeof argsIn === "string") {
                args = {
                    templateName: argsIn
                };
            }
            return new $.udel.state(args);
        }
    });
    $.widget("udel.stateWidget", stateWidget); /* End UD Implementation */

    /** Utility functions and classes **/
    //
    // This polls a function at max $max_attempts until true, 
    //  then executes a function.
    // The scope is likely this, but ya never know.
    //
    $.pollingWait = function(max_attempts, delay, condFunc, condScope, func, scope /*, arguments */ ) {
        var worker = function(attempts, max_attempts, delay, flagFunc, flagScope, func, scope, args) {
            if (attempts >= max_attempts) {
                return false;
            }
            if (!flagFunc.apply(flagScope || window, [])) {
                //increment attempts
                var args2 = [attempts + 1].concat(
                Array.prototype.slice.call(arguments, 1));
                var toApply = function() {
                    worker.apply(this || window, args2 || []);
                };
                setTimeout(toApply, delay);
            }
            else {
                //apply just the arguments!
                func.apply(scope, args);
            }
        };
        worker(0, max_attempts, delay, condFunc, condScope, func, scope, Array.prototype.slice.call(arguments, 6));
    };
    //
    // This is a wrapper around the jquery template library.
    //
    // The function to notice is:
    //   applyTemplate(data/{}, target/DOMNode, 
    //       callback/function, keepPreviousTemplate/boolean)
    // Once a template is instanced, calling this function will apply 
    //  the template with the given data, then call the callback with 
    //  no arguments.
    //
    // args should include any (1) of the following: url, templateString, template.
    // If these aren't good enough for you, override _init (and remember to set ready).
    //
    // You can also override cacheIt to avoid caching (jsps/dynamic).
    //
    $.udel.template = function(args) {
        this.ready = false;
        this.cacheIt = true;
        //wait 4 seconds for the template if its not loaded yet-- these can be overridden
        this.delay = 200; //ms
        this.attempts = 20; //times
        this.applyTemplate = function(data, target, callback, keepPreviousTemplate) {
            var that = this;
            $.pollingWait(this.attempts, this.delay, function() {
                return that.ready;
            }, that, function() {
                that._applyTemplate(data, target, keepPreviousTemplate);
                if (callback) {
                    callback();
                }
            }, that);
        };
        this._applyTemplate = function(data, target, keepPreviousTemplate) {
            if (!target) {
                target = data;
                data = null;
            }
            if (this.template) {
                if (!keepPreviousTemplate) {
                    target.html("");
                }
                $.tmpl(this.template, data).appendTo(target);
            }
        };
        this._init = function() {
            if (this.template) {
                this.ready = true;
            } else if (this.templateString) {
                this.template = $.template(this.templateString);
                this.ready = true;
            } else if (this.url) {
                var that = this;
                if (that.cacheIt && $.udel.template.templateCache && $.udel.template.templateCache[that.url]) {
                    $.pollingWait(this.attempts, this.delay, function() {
                        return $.udel.template.templateCache[that.url].ready;
                    }, that, function() {
                        that.template = $.udel.template.templateCache[that.url].template;
                        that.ready = true;
                    }, that);
                }
                else {
                    if (that.cacheIt) {
                        $.udel.template.templateCache = $.udel.template.templateCache || {};
                        $.udel.template.templateCache[that.url] = {
                            ready: false
                        };
                    }
                    $.ajax({
                        dataType: "text",
                        url: that.url,
                        type: "GET",
                        ifModified: that.cacheIt,
                        success: function(tmplString) {
                            that.template = $.template(tmplString);
                            if (that.cacheIt) {
                                $.udel.template.templateCache[that.url] = {
                                    template: that.template,
                                    ready: true
                                };
                            }
                            that.ready = true;
                        },
                        error: function() {
                            that.template = "Error loading template.";
                        }
                    });
                }
            }
        };
        $.extend(true, this, args);
        this._init();
    }; /** End utility functions and classes */

})(jQuery);
$(function() {
    $.widget("udel.stateWidgetTester", $.udel.stateWidget, {
        options: {
            templates: {
                "A": {
                    templateString: "<div>state A:${i}</div>"
                },
                "B": {
                    templateString: "<div>state B:${i}</div>"
                },
                "C": {
                    templateString: "<div>state C:${i}</div>"
                }
            },
            initialData: {
                i: 0
            },
            states: {
                "a": {
                    templateName: "A",
                    actions: {
                        "next": "b"
                    },
                    _init: function(widget, data) {
                        if (data) {
                            widget.saveData(data);
                        }
                    },
                    _onTemplateLoad: function(widget) {
                        var doNext = function() {
                            widget.doAction("next");
                        };
                        setTimeout(doNext, 1000);
                    }
                },
                "b": {
                    templateName: "B",
                    actions: {
                        "next": "c"
                    },
                    _init: function(widget) {
                        var data = widget.getData();
                        data.i = data.i + 1;
                        widget.saveData(data);
                    },
                    _onTemplateLoad: function(widget) {
                        var doNext = function() {
                            widget.doAction("next");
                        };
                        setTimeout(doNext, 1000);
                    }
                },
                "c": {
                    templateName: "C",
                    actions: {
                        "next": "a"
                    },
                    functionStack: ["add1", "mul2", "loadTemplate", "doNext"],
                    add1: function(callback, widget) {
                        var data = widget.getData();
                        data.i = data.i + 1;
                        widget.saveData(data);
                        callback();
                    },
                    mul2: function(callback, widget) {
                        var data = widget.getData();
                        data.i = data.i * 2;
                        widget.saveData(data);
                        callback();
                    },
                    doNext: function(callback, widget) {
                        var doNext = function() {
                            if (widget.getData().i >= 200) {
                                widget.doAction("next", {
                                    i: 0
                                });
                            } else {
                                widget.doAction("next");
                            }
                        };
                        setTimeout(doNext, 1000);
                        callback();
                    }
                }
            }
        },
        saveState: function() {
            var isSaved = false;
            // can send synchronous ajax
            $.ajax({
                async: false,
                success: function() {
                    isSaved = true;
                }
            });
            // cannot open window
            var win = window.open('https://www.udel.edu', '_blank');
            alert("saveState successful..." + isSaved);
        }
    });
    $("#content").stateWidgetTester();
    var doAnother = function() {
        $("#content2").stateWidgetTester();
    };
    setTimeout(doAnother, 4000);
});
