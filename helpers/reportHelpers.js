const SegmentTarget = require("../models/SegmentTarget");
const ChannelTarget = require("../models/ChannelTarget");

function filterSalesData(data, filterType, timePeriod) {
    // Implement your filter logic here based on filterType (Value/Volume) and timePeriod (MTD/YTD)
    return data.filter(row => {
      // Example filter logic
      if (filterType === 'Value' && timePeriod === 'MTD') {
        return row['MTD VALUE'] > 0;
      } else if (filterType === 'Volume' && timePeriod === 'YTD') {
        return row['YTD VOLUME'] > 0;
      }
      // Add more conditions as required
      return true;
    });
  }

function generateSegmentWiseReport(data) {
    // Implement your report generation logic here
    return data.map(row => ({
      priceBand: row['PRICE BAND'],
      contribution: calculateContribution(row),
      valueTarget: row['TARGET'],
      mtd: row['MTD VOLUME'],
      mtdAch: row['ACHIEVEMENT'],
      lmtd: row['LMTD VOLUME'],
      pendingVal: calculatePendingValue(row),
      extrapolated: calculateExtrapolated(row),
      growth: calculateGrowth(row),
      lmAds: row['LM ADS'],
      cmAds: row['CM ADS'],
      reqAds: calculateRequiredAds(row),
      d1: row['D-1'],
      ftd: row['FTD'],
    }));
  }

function calculateContribution(row) {
    // Implement your calculation logic for % contribution
    return (row['MTD VALUE'] / row['TARGET']) * 100; // Example calculation
  }
  
  function calculatePendingValue(row) {
    // Implement your calculation logic for pending value
    return row['TARGET'] - row['MTD VALUE']; // Example calculation
  }
  
  function calculateExtrapolated(row) {
    // Implement your calculation logic for % extrapolated
    return (row['MTD VALUE'] / row['LMTD VALUE']) * 100; // Example calculation
  }
  
  function calculateGrowth(row) {
    // Implement your calculation logic for growth
    return ((row['MTD VALUE'] - row['LMTD VALUE']) / row['LMTD VALUE']) * 100; // Example calculation
  }
  
  function calculateRequiredAds(row) {
    // Implement your calculation logic for required ADS
    return row['TARGET'] / 30; // Example calculation
  }

  function categorizePriceBand(price) {
    if (price > 100000) return '>100K';
    if (price > 70000) return '70-100K';
    if (price > 40000) return '40-70K';
    if (price > 30000) return '30-40K';
    if (price > 20000) return '20-30K';
    if (price > 15000) return '15-20K';
    if (price > 10000) return '10-15K';
    if (price > 6000) return '6-10K';
    return '6-10K'; // Default to the lowest range for prices <= 6000
  }

const getMonthFromDate = (dateString) => {
  const [month, , year] = dateString.split('/');
  return `${month.padStart(2, '0')}/${year}`;
};

exports.fetchTargetValuesAndVolumes = async (endDate, name, category) => {
  // Fetch target values and volumes from the database using a separate date variable
  let targetDate = new Date(endDate);
  const targetMonth = getMonthFromDate(targetDate.toLocaleDateString('en-US'));

  // Format targetStartDate as M/D/YYYY
  const [month, year] = targetMonth.split('/');
  const targetStartDate = `${parseInt(month)}/1/${year}`;

  const targets = await SegmentTarget.find({ Name: name, Category: category, 'Start Date': targetStartDate.toString() });

  const targetValues = targets.reduce((acc, target) => {
      acc[target.Segment] = parseInt(target['Target Value']);
      return acc;
  }, {});

  const targetVolumes = targets.reduce((acc, target) => {
      acc[target.Segment] = parseInt(target['Target Volume']);
      return acc;
  }, {});

  return { targetValues, targetVolumes };
};

exports.fetchTargetValuesAndVolumesByChannel = async (endDate, name, category) => {
  // Create a new date object for the target date based on the provided end date
  let targetDate = new Date(endDate);
  const targetMonth = getMonthFromDate(targetDate.toLocaleDateString('en-US'));

  // Format targetStartDate as M/D/YYYY
  const [month, year] = targetMonth.split('/');
  const targetStartDate = `${parseInt(month)}/1/${year}`;

  // Fetch target values and volumes for the specified name, category, and start date
  const targets = await ChannelTarget.find({ Name: name, Category: category, 'Start Date': targetStartDate.toString() });

  // Extract target values by channel
  const targetValuesByChannel = targets.reduce((acc, target) => {
      acc[target.Channel] = parseInt(target['Target Value']);
      return acc;
  }, {});

  // Extract target volumes by channel
  const targetVolumesByChannel = targets.reduce((acc, target) => {
      acc[target.Channel] = parseInt(target['Target Volume']);
      return acc;
  }, {});

  return { targetValuesByChannel, targetVolumesByChannel };
};


exports.getMonthFromDateExported = (dateString) => {
  const [month, , year] = dateString.split('/');
  return `${month.padStart(2, '0')}/${year}`;
};
