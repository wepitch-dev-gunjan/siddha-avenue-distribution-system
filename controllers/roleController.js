const Role = require('../models/Role');

exports.getRole = async (req, res) => {
  try {
    const { role_id } = req

    // Fetch user details from the database
    const role = await Role.findOne({ _id: role_id });
    res.status(200).json(role);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getRoles = async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};

    // Use a regular expression for case-insensitive search on both name and email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    // Fetch user details from the database
    const roles = await Role.find(query);
    res.status(200).json(roles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.createRole = async (req, res) => {
  try {
    const { role_name } = req.body;

    let role = await Role.findOne({ name: role_name });
    if (role) return res.status(400).send({
      error: "Role already exists"
    })

    role = new Role({
      name: role_name,
    })
    role = await role.save()
    res.status(200).send({
      message: "Role created successfully",
      role
    })
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const { role_name } = req.params;

    let role = await Role.findOneAndDelete({ name: role_name });
    if (role) return res.status(400).send({
      error: "Role doesn't exists"
    })

    role = await role.save()
    res.status(200).send({
      message: "Role deleted successfully",
      role
    })
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};