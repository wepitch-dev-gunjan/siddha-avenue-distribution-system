exports.getLastDaysOfPreviousMonths = () => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // Current month (1-12)
  const lastDays = [];

  for (let month = 1; month < currentMonth; month += 1) {
    let lastDayOfMonth;
    if (month === 2) {
      // February: Adjust for leap years
      const isLeapYear = (currentYear % 4 === 0 && currentYear % 100 !== 0) || currentYear % 400 === 0;
      lastDayOfMonth = isLeapYear ? 29 : 28;
    } else if ([4, 6, 9, 11].includes(month)) {
      // April, June, September, November: 30 days
      lastDayOfMonth = 30;
    } else {
      // Other months: 31 days
      lastDayOfMonth = 31;
    }

    lastDays.push(`${currentYear}-${month.toString().padStart(2, '0')}-${lastDayOfMonth}`);
  }

  return lastDays;
}

exports.channelOrder = [
  'Exclusive',
  'PC',
  'SCP',
  'RRF EXT',
  'SIS PRO',
  'SIS PLUS',
  'STAR DCM',
  'DCM',
]

exports.segmentOrder = [
  'Exclusive',
  'PC',
  'SCP',
  'RRF EXT',
  'SIS PRO',
  'SIS PLUS',
  'STAR DCM',
  '< 6 K',
]

// Function to get the start of the month
exports.getStartOfMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

// Function to get the start and end dates for the same period last month
exports.getLastMonthPeriod = (date) => {
  const lastMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const daysElapsed = date.getDate();
  const start = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
  const end = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), daysElapsed);
  return { start, end };
};

// Function to calculate the target based on previous performance
exports.calculateTarget = (lmtVolume, growthFactor = 0.10) => {
  const baseTarget = lmtVolume ? parseInt(lmtVolume, 10) : 10; // Default to 10 if LMT_VOLUME is 0 or not available
  return Math.ceil(baseTarget * (1 + growthFactor));
};

exports.parseDate = (dateString) => {
  const [month, day, year] = dateString.split('/');
  return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
};


// exports.formatNumberIndian = (num) => {
//   if (num >= 1e7) {
//     return (num / 1e7).toFixed(2) + ' Cr';
//   }
//   if (num >= 1e5) {
//     return (num / 1e5).toFixed(2) + ' L';
//   }
//   if (num >= 1e3) {
//     return (num / 1e3).toFixed(2) + ' K';
//   }
//   return num.toString();
// };

exports.formatNumberIndian = (num) => {
  if (num === undefined || num === null || isNaN(num)) {
    return ''; // or any default value you prefer
  }

  if (num >= 1e7) {
    return (num / 1e7).toFixed(2) + ' Cr';
  }
  if (num >= 1e5) {
    return (num / 1e5).toFixed(2) + ' L';
  }
  if (num >= 1e3) {
    return (num / 1e3).toFixed(2) + ' K';
  }

  return num.toString();
};

