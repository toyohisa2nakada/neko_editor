// values control
export function create_values(n, label) {
	const self = { label };
	self.maxN = n ?? 8;
	self.values = [];
	self.maxValue = undefined;
	self.minValue = undefined;
	self.aveValue = undefined;
	self.sumValue = undefined;
	self.needForAve = true;
	self.ignoreCount = 0;

	self.ignore = function (count) {
		self.ignoreCount = count;
	}
	self.add = function (v) {
		if (self.ignoreCount > 0) {
			self.ignoreCount--;
			return self;
		}
		self.values.push(v);
		self.maxValue = self.maxValue === undefined ? v : (v > self.maxValue ? v : self.maxValue);
		self.minValue = self.minValue === undefined ? v : (v < self.minValue ? v : self.minValue);
		self.sumValue = self.sumValue === undefined ? v : self.sumValue + v;
		if (self.values.length > self.maxN) {
			var dv = self.values[0];
			self.remove(0);
			self.sumValue -= dv;
			if (dv === self.maxValue || dv === self.minValue) {
				self.findMaxMinValue();
			}
		}
		self.needForAve = true;
		return self;
	}
	self.remove = function (index) {
		if (index < 0 || index >= self.values.length) {
			return undefined;
		}
		var dv = Number(self.values.splice(index, 1));
		if (dv === self.maxValue || dv === self.minValue) {
			self.findMaxMinValue();
		}
		self.sumValue -= dv;
		self.needForAve = true;
	}
	self.max = function () {
		return self.maxValue;
	}
	self.min = function () {
		return self.minValue;
	}
	self.ave = function () {
		if (self.needForAve === true) {
			self.findAveValue();
			self.needForAve = false;
		}
		return self.aveValue;
	}
	self.sum = function () {
		return self.sumValue;
	}
	self.size = function () {
		return self.values.length;
	}
	self.maxSize = function () {
		return self.maxN;
	}
	self.full = function () {
		return self.values.length === self.maxN;
	}
	self.clear = function () {
		self.values = [];
		self.maxValue = undefined;
		self.minValue = undefined;
		self.needForAve = false;
	}

	self.findMaxMinValue = function () {
		self.maxValue = undefined;
		self.minValue = undefined;
		self.values.forEach(function (v) {
			self.maxValue = self.maxValue === undefined ? v : (v > self.maxValue ? v : self.maxValue);
			self.minValue = self.minValue === undefined ? v : (v < self.minValue ? v : self.minValue);
		});
	}
	self.findAveValue = function () {
		self.aveValue = 0.0;
		if (self.values.length > 0) {
			self.values.forEach(function (v) {
				self.aveValue += v;
			});
			self.aveValue /= self.values.length;
		}
	}
	return self;
}
