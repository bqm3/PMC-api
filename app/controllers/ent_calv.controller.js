const {
  Ent_calv,
  Ent_duan,
  Ent_khoicv,
  Ent_user,
  Ent_chucvu
} = require("../models/setup.model");

exports.create = async (req, res) => {
  try {
    const userData = req.user.data;
    if(userData){
      if (!req.body.Tenca) {
        res.status(400).send({
          message: "Cần nhập đầy đủ thông tin!",
        });
        return;
      } else if (!req.body.Giobatdau || !req.body.Gioketthuc) {
        res.status(400).send({
          message: "Cần có thời gian bắt đầu và kết thúc!",
        });
        return;
      }
    
      const reqData = {
        ID_Duan: req.body.ID_Duan,
        ID_KhoiCV: req.body.ID_KhoiCV,
        Tenca: req.body.Tenca,
        Giobatdau: req.body.Giobatdau,
        Gioketthuc: req.body.Gioketthuc,
        ID_User: userData.ID_User,
        isDelete: 0,
      };
    
      Ent_calv
        .create(reqData)
        .then((data) => {
          res.status(201).json({
            message: "Tạo ca làm việc thành công!",
            data: data,
          });
        })
        .catch((err) => {
          res.status(500).send({
            message:
              err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    }
  } catch (error) {
    res.status(500).send({
      message:
      error.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.get = async (req, res) => {
  try {
    const userData = req.user.data;
    if (userData) {
      await Ent_calv.findAll({
        attributes: [
          "ID_Calv",
          "ID_KhoiCV",
          "ID_Duan",
          "Tenca",
          "Giobatdau",
          "Gioketthuc",
          "ID_User",
          "isDelete",
        ],
        include: [
          {
            model: Ent_duan,
            attributes: ["Duan"],
          },
          {
            model: Ent_khoicv,
            attributes: ["KhoiCV"],
          },
          {
            model: Ent_user,
            include: {
              model: Ent_chucvu,
              attributes: ["Chucvu"],
            },
            attributes: ["UserName", "Emails",],
          },
        ],
        where: {
          isDelete: 0,
        },
      })
        .then((data) => {
          res.status(201).json({
            message: "Danh sách ca làm việc!",
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
      await Ent_calv.findByPk(req.params.id, {
        attributes: [
          "ID_Calv",
          "ID_KhoiCV",
          "ID_Duan",
          "Tenca",
          "Giobatdau",
          "Gioketthuc",
          "ID_User",
          "isDelete",
        ],
        include: [
          {
            model: Ent_duan,
            attributes: ["Duan"],
          },
          {
            model: Ent_khoicv,
            attributes: ["KhoiCV"],
          },
          {
            model: Ent_user,
            include: {
              model: Ent_chucvu,
              attributes: ["Chucvu"],
            },
            attributes: ["UserName", "Emails",],
          },
        ],
        where: {
          isDelete: 0,
        },
      })
        .then((data) => {
          res.status(201).json({
            message: "Ca làm việc chi tiết!",
            data: data,
          });
        })
        .catch((err) => {
          res.status(500).json({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    }else{
      return res.status(401).json({
        message: "Không tồn tại ca làm việc",
      });
    }
    
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};