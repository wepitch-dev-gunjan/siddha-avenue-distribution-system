const express = require("express");
const router = express.Router();
const { upload } = require("../services/fileUpload");
const { 
    uploadSalesDataMTDW, 
    getSalesDashboardDataForEmployeeMTDW, 
    getSalesDataChannelWiseForEmployeeMTDW, 
    getSalesDataSegmentWiseForEmployeeMTDW, 
    getSalesDashboardDataForDealerMTDW
} = require("../controllers/salesDataMTDWController");

router.post("/sales-data-mtdw", upload.single("file"), uploadSalesDataMTDW);

// EMPLOYEE ROUTES 
router.get("/sales-data-mtdw/dashboard/employee", getSalesDashboardDataForEmployeeMTDW);
router.get("/sales-data-mtdw/channel-wise/employee", getSalesDataChannelWiseForEmployeeMTDW);
router.get("/sales-data-mtdw/segment-wise/employee", getSalesDataSegmentWiseForEmployeeMTDW);

// DEALER ROUTES 
router.get("/sales-data-mtdw/dashboard/dealer", getSalesDashboardDataForDealerMTDW);


module.exports = router;