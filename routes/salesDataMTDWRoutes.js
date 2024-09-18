const express = require("express");
const router = express.Router();
const { upload } = require("../services/fileUpload");
const { 
    uploadSalesDataMTDW, 
    getSalesDashboardDataForEmployeeMTDW, 
    getSalesDataChannelWiseForEmployeeMTDW, 
    getSalesDataSegmentWiseForEmployeeMTDW, 
    getSalesDashboardDataForDealerMTDW,
    getSalesDataChannelWiseForDealerMTDW,
    getSalesDataSegmentWiseForDealerMTDW
} = require("../controllers/salesDataMTDWController");
const { dealerAuth, userAuth } = require("../middlewares/authMiddlewares");

router.post("/sales-data-mtdw", upload.single("file"), uploadSalesDataMTDW);

// EMPLOYEE ROUTES 
router.get("/sales-data-mtdw/dashboard/employee", userAuth,  getSalesDashboardDataForEmployeeMTDW);
router.get("/sales-data-mtdw/channel-wise/employee", userAuth, getSalesDataChannelWiseForEmployeeMTDW);
router.get("/sales-data-mtdw/segment-wise/employee", userAuth, getSalesDataSegmentWiseForEmployeeMTDW);

// DEALER ROUTES 
router.get("/sales-data-mtdw/dashboard/dealer", dealerAuth,  getSalesDashboardDataForDealerMTDW);
router.get("/sales-data-mtdw/channel-wise/dealer", dealerAuth, getSalesDataChannelWiseForDealerMTDW);
router.get("/sales-data-mtdw/segment-wise/dealer", dealerAuth, getSalesDataSegmentWiseForDealerMTDW);

module.exports = router;