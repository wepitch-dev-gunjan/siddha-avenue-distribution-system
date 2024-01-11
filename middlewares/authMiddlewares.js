const Role = require("../models/Role");
const User = require("../models/User");

exports.userAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization');
    if (!token) {
      return res.status(401).json({ error: 'No token found, authorization denied' });
    }

    // Verify the token using your secret key
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findOne({ email: decoded.email });

    if (!user) {
      return res.status(401).json({ error: 'User not authorized' });
    }

    req.name = decoded.name;
    req.email = decoded.email;
    req.user_id = decoded.user_id

    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.adminAuth = async (req, res, next) => {
  try {
    const { user_id } = req;
    const user = await User.findOne({ _id: user_id })

    const role = await Role.findOne({ _id: user.role })
    if (role.name !== 'ADMIN') return res.status(401).send({
      error: 'User is not admin'
    })

    next()
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};