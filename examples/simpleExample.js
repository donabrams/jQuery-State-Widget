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
})(jQuery);
