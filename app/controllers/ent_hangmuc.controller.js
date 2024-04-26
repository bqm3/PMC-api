const {
  Ent_hangmuc,
  Ent_toanha,
  Ent_khoicv,
} = require("../models/setup.model");
const { Ent_khuvuc } = require("../models/setup.model");
const { Op } = require("sequelize");

// Create and Save a new Ent_tang
exports.create = async (req, res, next) => {
  // Validate request
  try {
    if (!req.body.Hangmuc || !req.body.Tieuchuankt) {
      res.status(400).json({
        message: "Cần nhập đầy đủ thông tin!",
      });
      return;
    }
    const MaQrCode = req.body.MaQrCode;

    const userData = req.user.data;
    if (userData) {
      const existingHangMuc = await Ent_hangmuc.findOne({
        where: {
          MaQrCode: MaQrCode,
          isDelete: 0,
        },
        attributes: ["ID_Hangmuc", "MaQrCode", "isDelete"],
      });

      // Kiểm tra QR code trong Ent_khuvuc
      const existingKhuVuc = await Ent_khuvuc.findOne({
        attributes: ["ID_Khuvuc", "MaQrCode", "isDelete"],
        where: {
          MaQrCode: MaQrCode,
          isDelete: 0,
        },
      });

      if (existingHangMuc || existingKhuVuc) {
        // QR code đã tồn tại trong một trong hai bảng
        return res.status(500).json({
          message: "QR code trùng lặp, không thể thêm mới.",
        });
      } else {
        // QR code không trùng lặp, cho phép thêm mới
        const data = {
          ID_Khuvuc: req.body.ID_Khuvuc,
          MaQrCode: req.body.MaQrCode || null,
          Hangmuc: req.body.Hangmuc || null,
          Tieuchuankt: req.body.Tieuchuankt || null,
          isDelete: 0,
        };

        Ent_hangmuc.create(data)
          .then((data) => {
            res.status(200).json({
              message: "Tạo hạng mục thành công!",
              data: data,
            });
          })
          .catch((err) => {
            res.status(500).json({
              message: err.message || "Lỗi! Vui lòng thử lại sau.",
            });
          });
      }
    } else {
      return res.status(500).json({
        message: "Bạn không có quyền tạo hạng mục.",
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
    const orConditions = [];
    if (userData) {
      orConditions.push({
        "$ent_khuvuc.ent_toanha.ID_Duan$": userData?.ID_Duan,
      });
      if (userData.ID_KhoiCV !== null) {
        orConditions.push({
          "$ent_khuvuc.ID_KhoiCV$": userData.ID_KhoiCV,
        });
      }
      await Ent_hangmuc.findAll({
        attributes: [
          "ID_Hangmuc",
          "ID_Khuvuc",
          "MaQrCode",
          "Hangmuc",
          "Tieuchuankt",
          "isDelete",
        ],
        include: [
          {
            model: Ent_khuvuc,
            attributes: [
              "ID_Toanha",
              "ID_Khuvuc",
              "ID_KhoiCV",
              "Sothutu",
              "MaQrCode",
              "Tenkhuvuc",
              "ID_User",
              "isDelete",
            ],
            where: {
              isDelete: 0,
            },
            include: [
              {
                model: Ent_toanha,
                attributes: [
                  "ID_Toanha",
                  "ID_Duan",
                  "Toanha",
                  "Sotang",
                  "isDelete",
                ],
                where: {
                  isDelete: 0,
                },
              },
            ],
          },
        ],
        where: {
          isDelete: 0,
          [Op.and]: [orConditions],
        },
      })
        .then((data) => {
          res.status(200).json({
            message: "Danh sách hạng mục!",
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
        ID_Khuvuc: req.body.ID_Khuvuc,
        MaQrCode: req.body.MaQrCode,
        Hangmuc: req.body.Hangmuc,
        Tieuchuankt: req.body.Tieuchuankt,
        isDelete: 0,
      };

      // Kiểm tra xem mã QR Code mới có trùng với bất kỳ bản ghi nào khác trong cơ sở dữ liệu không
      const existingHangMuc = await Ent_hangmuc.findOne({
        where: {
          MaQrCode: req.body.MaQrCode,
          ID_Hangmuc: { [Op.ne]: req.params.id },
          isDelete: 0,
        },
        attributes: ["MaQrCode", "ID_Hangmuc"],
      });

      const existingKhuVuc = await Ent_khuvuc.findOne({
        attributes: ["ID_Khuvuc", "MaQrCode", "isDelete"],
        where: {
          MaQrCode: req.body.MaQrCode,
          isDelete: 0,
        },
      });

      if (existingHangMuc || existingKhuVuc) {
        res.status(400).json({
          message: "Mã QR Code đã tồn tại!",
        });
        return;
      }

      Ent_hangmuc.update(reqData, {
        where: {
          ID_Hangmuc: req.params.id,
        },
      })
        .then((data) => {
          res.status(200).json({
            message: "Cập nhật hạng mục thành công!",
          });
        })
        .catch((err) => {
          res.status(500).json({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    }
  } catch (error) {
    res.status(500).json({
      message: error.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const userData = req.user.data;
    if (req.params.id && userData) {
      Ent_hangmuc.update(
        { isDelete: 1 },
        {
          where: {
            ID_Hangmuc: req.params.id,
          },
        }
      )
        .then((data) => {
          res.status(200).json({
            message: "Xóa hạng mục thành công!",
          });
        })
        .catch((err) => {
          res.status(500).json({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    }
  } catch (error) {
    res.status(500).json({
      message: error.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.filterByKhuvuc = async (req, res) => {
  try {
    const userData = req.user.data;
    const ID_Khuvuc = req.params.id;

    if (userData) {
      // Xây dựng điều kiện where dựa trên các giá trị đã kiểm tra
      const whereCondition = {
        [Op.and]: [],
      };

      if (userData.Permission === 3 || userData.UserName === "PSH") {
        // Nếu userData.Permission == 1, không cần thêm điều kiện where, lấy tất cả khu vực
      } else {
        // Nếu userData.Permission !== 1, thêm điều kiện where theo ID_KhoiCV và ID_Duan
        if (userData.ID_Duan !== null) {
          whereCondition["$ent_khuvuc.ent_toanha.ID_Duan$"] = userData.ID_Duan;
        }
        if (userData.ID_KhoiCV !== null) {
          whereCondition["$ent_khuvuc.ID_KhoiCV$"] = userData.ID_KhoiCV;
        }
        if (ID_Khuvuc !== null && ID_Khuvuc !== "" && ID_Khuvuc !== "null") {
          whereCondition[Op.and].push({
            ID_Khuvuc: ID_Khuvuc,
          });
        }
      }
      // Thêm điều kiện isDelete
      whereCondition.isDelete = 0;
      Ent_hangmuc.findAll({
        attributes: [
          "ID_Hangmuc",
          "ID_Khuvuc",
          "MaQrCode",
          "Hangmuc",
          "Tieuchuankt",
          "isDelete",
        ],
        include: [
          {
            model: Ent_khuvuc,
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
                attributes: ["Toanha", "Sotang", "ID_Toanha"],
              },
              {
                model: Ent_khoicv,
                attributes: ["KhoiCV"],
              },
            ],
          },
        ],
        where: whereCondition,
      })
        .then((data) => {
          res.status(200).json({
            message: "Thông tin hạng mục!",
            data: data,
          });
        })
        .catch((err) => {
          res.status(500).json({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    } else {
      // Trả về lỗi nếu không có dữ liệu người dùng hoặc không có ID được cung cấp
      return res.status(400).json({
        message: "Vui lòng cung cấp ít nhất một trong hai ID.",
      });
    }
  } catch (error) {
    res.status(500).json({
      message: error.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.filterByQr = async (req, res) => {
  try {
    const userData = req.user.data;

    if (userData) {
      // Xây dựng điều kiện where dựa trên các giá trị đã kiểm tra
      const whereCondition = {
        [Op.and]: [],
      };

      if (userData.Permission === 3 || userData.UserName === "PSH") {
        // Nếu userData.Permission == 1, không cần thêm điều kiện where, lấy tất cả khu vực
      } else {
        // Nếu userData.Permission !== 1, thêm điều kiện where theo ID_KhoiCV và ID_Duan
        if (userData.ID_Duan !== null) {
          whereCondition["$ent_khuvuc.ent_toanha.ID_Duan$"] = userData.ID_Duan;
        }
        if (userData.ID_KhoiCV !== null) {
          whereCondition["$ent_khuvuc.ID_KhoiCV$"] = userData.ID_KhoiCV;
        }
       
      }
      // Thêm điều kiện isDelete
      whereCondition.isDelete = 0;
      whereCondition.MaQrCode = req.body.MaQrCode;
      Ent_hangmuc.findOne({
        attributes: [
          "ID_Hangmuc",
          "ID_Khuvuc",
          "MaQrCode",
          "Hangmuc",
          "Tieuchuankt",
          "isDelete",
        ],
        include: [
          {
            model: Ent_khuvuc,
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
                attributes: ["Toanha", "Sotang", "ID_Toanha"],
              },
              {
                model: Ent_khoicv,
                attributes: ["KhoiCV"],
              },
            ],
          },
        ],
        where: whereCondition,
      })
        .then((data) => {
          res.status(200).json({
            message: "Thông tin hạng mục!",
            data: data ?  [data] : [],
          });
        })
        .catch((err) => {
          res.status(500).json({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    } else {
      // Trả về lỗi nếu không có dữ liệu người dùng hoặc không có ID được cung cấp
      return res.status(400).json({
        message: "Vui lòng thử lại sau.",
      });
    }
  } catch (error) {
    res.status(500).json({
      message: error.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};
