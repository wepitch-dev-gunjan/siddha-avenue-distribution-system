const Role = require('../models/Role');
const User = require('../models/User');

exports.getRole = async (req, res) => {
  try {
    const { role_id } = req.params;
    if (!role_id) return res.status(400).send({
      error: 'Role Id is required'
    })

    const role = await Role.findOne({ _id: role_id });
    if (!role) return res.status(404).send({
      error: "Role not found"
    })
    res.status(200).json(role);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getChildrenRoles = async (req, res) => {
  try {
    let { role_id } = req.params;
    // role_id = JSON.parse(role_id);
    console.log('getChildrenRoles', !!role_id);
    // Check if roleId is provided in the query parameter
    if (role_id == undefined) {
      return res.status(400).json({ error: 'Role ID is required.' });
    }

    // Fetch the role details based on the provided roleId
    const role = await Role.findById(role_id);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const childrenRoles = await Role.find({ _id: { $in: role.children } })
    res.status(200).json(childrenRoles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.find();
    if (!roles) {
      return res.status(404).json({ error: 'Roles not found' });
    }

    res.status(200).json(roles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.createRole = async (req, res) => {
  try {
    // Extract data from the request body
    const { role_name, parents, children } = req.body;
    console.log(role_name)
    // Check if the role already exists
    let role = await Role.findOne({ name: role_name });
    if (role) {
      return res.status(400).send({
        error: "Role already exists"
      });
    }

    // Initialize empty arrays for parentRoles and childRoles
    let parentRoles = [];
    let childRoles = [];

    // Find parent roles if there are any
    if (parents?.length > 0) {
      parentRoles = await Role.find({ _id: { $in: parents } });
      // Check if all requested parent roles were found
      if (parentRoles.length !== parents.length) {
        return res.status(400).send({
          error: "One or more parent roles not found"
        });
      }
    }

    // Find child roles if there are any
    if (children?.length > 0) {
      childRoles = await Role.find({ _id: { $in: children } });

      // Check if all requested child roles were found
      if (childRoles.length !== children.length) {
        return res.status(400).send({
          error: "One or more child roles not found"
        });
      }
    }

    // Create a role object with the provided data
    const roleObj = {
      name: role_name
    };

    // If there are parent roles, include them in the roleObj
    if (parentRoles.length > 0) {
      roleObj.parents = parentRoles.map(parent => parent._id);
    }

    // If there are child roles, include them in the roleObj
    if (childRoles.length > 0) {
      roleObj.children = childRoles.map(child => child._id);
    }

    // Create the new role
    role = new Role(roleObj);
    role = await role.save();

    // Update parent roles to include the new role ID in their children field
    await Role.updateMany(
      { _id: { $in: parents } },
      { $push: { children: role._id } }
    );

    // Update child roles to include the new role ID in their parent field
    await Role.updateMany(
      { _id: { $in: children } },
      { $push: { parents: role._id } }
    );

    // Send a success response
    res.status(200).send({
      message: "Role created successfully",
      role
    });
  } catch (error) {
    // Log and send an error response in case of any issues
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