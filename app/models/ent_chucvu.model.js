const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../config/db.config");

const Ent_chucvu = sequelize.define(
  "ent_chucvu",
  {
    ID_Chucvu: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    Chucvu: {
      type: DataTypes.CHAR,
      allowNull: false,
    },

    isDelete: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
    tableName: "ent_chucvu",
  }
);

module.exports = Ent_chucvu;
