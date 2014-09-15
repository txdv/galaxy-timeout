(function () {

var galaxy = require('galaxy');

function *waitForOne(futures) {
	return yield galaxy.star(function(cb) {
		for (var i = 0; i < futures.length; i++) {
			galaxy.unstar(futures[i], 0)(function(e, r) {
				if (cb) cb(e, r);
				cb = null;
			});
		}
	}, 0)();
}

function *waitForOneIndexInterrupt(futures) {
	function *ret(future, index) {
		return [index, future, yield future];
	}

	var timedOut = false;
	var futs = futures.map(function(o, i) {
		return galaxy.spin(ret(o , i), {
			interrupt: function() { return timedOut; }
		});
	});

	var ret = yield waitForOne(futs);
	timedOut = true;
	return ret;
}

Timeout.Exception = function(delay) {
	this.delay = delay;
}

function timeout_(func, delay, callback) {
	if (delay < 0) {
		// we already behind, so just return a Timeout.Exception
		callback(new Timeout.Exception(delay));
		return;
	}
	var timer = setTimeout(function () {
		callback(new Timeout.Exception(delay));
		callback = null;
	}, delay);

	func(function (error, value) {
		clearTimeout(timer);
		if (callback) {
			callback(null, value);
		}
	});
};

function timeout(future, delay, callback) {
	return timeout_(galaxy.unstar(galaxy.spin(future), 0), delay, callback);
}

var timeoutAsync = galaxy.star(timeout);

function simpleTimeout(delay, callback) {
	setTimeout(function () {
		if (callback && typeof callback === 'function') {
			callback(null);
		}
	}, delay);
};

var simpleTimeoutAsync = galaxy.star(simpleTimeout);

function Timeout(delay) {
	var t = Date.now();
	this.delay = delay;

	this.realDelay = function () {
		return Date.now() - t;
	};

	this.leftDelay = function () {
		return delay - this.realDelay();
	};

	this.check = function (func, callback) {
		return timeout_(func, this.leftDelay(), callback);
	};

	this.checkAsync = function *(future) {
		var i = yield waitForOneIndexInterrupt([future(), simpleTimeoutAsync(delay)]);
		if (i[0] == 1) {
			throw new Timeout.Exception(delay);
		} else {
			return i[2];
		}
	};
}

Timeout.check = function (func, delay, callback) {
	timeout_(func, delay, callback);
};

Timeout.checkAsync = function (future, delay) {
	return timeoutAsync(future(), delay);
};

if (module.parent) {
	module.exports = Timeout;
	return;
}

function *benchmark(future) {
	var time = Date.now();
	yield future;
	console.log(Date.now() - time + 'ms');
};


galaxy.main(function *() {
	var t = new Timeout(300);
	try {
		/*
		// old school javascript contination-passing style
		t.check(function (cb) {
			cb(null, 0);
		}, function (error, value) {
			if (value !== 0) {
				console.log('value should be 0');
			}
			console.log('Time passed: ' + t.realDelay());
		});
		*/

		/*
		// we can call every continuation seperately
		yield t.checkAsync(simpleTimeoutAsync(200));
		// every step in between won't timeout, good if you want to
		// ensure atomicity of code
		console.log('step');
		yield t.checkAsync(simpleTimeoutAsync(200));
		*/

		// and we can call everything in one block
		// however if the step itself is a star function
		// it could timeout, therefore atomicity is not ensured.

		yield t.checkAsync(function *() {
			console.log('1');
			yield simpleTimeoutAsync(200);
			console.log('2');
			yield simpleTimeoutAsync(200);
			console.log('3');
		}, 300);

	} catch (ex) {
		if (ex instanceof Timeout.Exception) {
			console.log(ex);
			console.log("timeout: " + t.delay + ", real: " + t.realDelay());
		} else {
			console.log(ex);
		}
	}
});


})();
