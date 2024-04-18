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
  'Exclusive', 'PC', 'SCP', 'RRF EXT', 'SIS PRO', 'SIS PLUS', 'STAR DCM', 'DCM'
]
