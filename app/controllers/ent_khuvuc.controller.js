const { Ent_toanha, Ent_khuvuc, Ent_khoicv } = require("../models/setup.model");

exports.create = (req, res) => {
  // Validate request
  try {
    if (
      !req.body.ID_Toanha ||
      !req.body.ID_KhoiCV ||
      !req.body.Sothutu ||
      !req.body.Makhuvuc ||
      !req.body.MaQrCode ||
      !req.body.Tenkhuvuc
    ) {
      res.status(400).send({
        message: "Phải nhập đầy đủ dữ liệu!",
      });
      return;
    }
    const userData = req.user.data;
    if (userData) {
      const data = {
        ID_Toanha: req.body.ID_Toanha,
        ID_KhoiCV: req.body.ID_KhoiCV,
        Sothutu: req.body.Sothutu,
        Makhuvuc: req.body.Makhuvuc,
        MaQrCode: req.body.MaQrCode,
        Tenkhuvuc: req.body.Tenkhuvuc,
        ID_User: userData.ID_User,
        isDelete: 0,
      };

      Ent_khuvuc.create(data)
        .then((data) => {
          res.status(201).json({
            message: "Tạo khu vực thành công!",
            data: data,
          });
        })
        .catch((err) => {
          res.status(500).send({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    }
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.get = async (req, res) => {
  try {
    const userData = req.user.data;
    if (userData) {
      await Ent_khuvuc.findAll({
        attributes: [
          "ID_Khuvuc",
          "ID_Toanha",
          "ID_KhoiCV",
          "Sothutu",
          "Makhuvuc",
          "MaQrCode",
          "Tenkhuvuc",
          "ID_User",
          "isDelete",
        ],
        include: [
          {
            model: Ent_toanha,
            attributes: ["Toanha", "Sotang"],
          },
          {
            model: Ent_khoicv,
            attributes: ["KhoiCV"],
          },
        ],
        where: {
          isDelete: 0,
        },
      })
        .then((data) => {
          res.status(201).json({
            message: "Danh sách khu vực!",
            data: data,
          });
        })
        .catch((err) => {
          res.status(500).json({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    }
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.getDetail = async (req, res) => {
  try {
    const userData = req.user.data;
    if (req.params.id && userData) {
      await Ent_khuvuc.findByPk(req.params.id, {
        attributes: [
          "ID_Khuvuc",
          "ID_Toanha",
          "ID_KhoiCV",
          "Sothutu",
          "Makhuvuc",
          "MaQrCode",
          "Tenkhuvuc",
          "ID_User",
          "isDelete",
        ],
        include: [
          {
            model: Ent_toanha,
            attributes: ["Toanha", "Sotang"],
          },
          {
            model: Ent_khoicv,
            attributes: ["KhoiCV"],
          },
        ],
        where: {
          isDelete: 0,
        },
      })
        .then((data) => {
          res.status(201).json({
            message: "Khu vực chi tiết!",
            data: data,
          });
        })
        .catch((err) => {
          res.status(500).json({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    }
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};


exports.update = async (req, res) => {
  try {
    const userData = req.user.data;
    if (req.params.id && userData) {
    
      const reqData = {
        ID_Toanha: req.body.ID_Toanha,
        ID_KhoiCV: req.body.ID_KhoiCV,
        Sothutu: req.body.Sothutu,
        Makhuvuc: req.body.Makhuvuc,
        MaQrCode: req.body.MaQrCode,
        Tenkhuvuc: req.body.Tenkhuvuc,
        ID_User: userData.ID_User,
        isDelete: 0,
      };

      Ent_khuvuc.update(reqData, {
        where: {
          ID_Khuvuc: req.params.id,
        },
      })
        .then((data) => {
          console.log('data',data)
          res.status(201).json({
            message: "Cập nhật khu vực thành công!",
          });
        })
        .catch((err) => {
          res.status(500).send({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    }
  } catch (error) {
    res.status(500).send({
      message: error.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const userData = req.user.data;
    if (req.params.id && userData) {
      Ent_khuvuc.update(
        { isDelete: 1 },
        {
          where: {
            ID_Khuvuc: req.params.id,
          },
        }
      )
        .then((data) => {
          res.status(201).json({
            message: "Xóa khu vực thành công!",
          });
        })
        .catch((err) => {
          res.status(500).send({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    }
  } catch (error) {
    res.status(500).send({
      message: error.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};
