const moment = require("moment");
const {
  Ent_duan,
  Ent_calv,
  Ent_khoicv,
  Tb_checklistc,
  Ent_chucvu,
  Ent_checklist,
  Ent_khuvuc,
  Ent_hangmuc,
  Ent_user,
  Ent_toanha,
  Tb_checklistchitiet,
  Tb_checklistchitietdone,
  Ent_tang,
  Ent_nhom,
  Ent_khuvuc_khoicv,
  Ent_thietlapca,
  Ent_duan_khoicv,
  Tb_sucongoai,
  Ent_chinhanh,
} = require("../models/setup.model");
const { Op, Sequelize } = require("sequelize");
const { uploadFile } = require("../middleware/auth_google");
const sequelize = require("../config/db.config");
const cron = require("node-cron");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

function convertTimeFormat(timeStr) {
  if (!timeStr.includes("AM") && !timeStr.includes("PM")) {
    return timeStr;
  }

  // Tách phần giờ, phút, giây và phần AM/PM
  let [time, modifier] = timeStr.split(" ");

  // Tách giờ, phút, giây ra khỏi chuỗi thời gian
  let [hours, minutes, seconds] = time.split(":");

  // Nếu giờ là 12 AM, đổi thành 0 (nửa đêm)
  if (hours === "12" && modifier === "AM") {
    hours = "00";
  } else if (modifier === "PM" && hours !== "12") {
    // Nếu không phải 12 PM, cộng thêm 12 giờ
    hours = (parseInt(hours, 10) + 12).toString().padStart(2, "0");
  }

  // Trả về chuỗi thời gian mới
  return `${hours}:${minutes}:${seconds}`;
}

function getCurrentDayInCycle(ngayBatDau, ngayHienTai, chuKy) {
  // Chuyển đổi ngày bắt đầu và ngày hiện tại thành số mốc thời gian (timestamp)
  const ngayBatDauTime = new Date(ngayBatDau).getTime();
  const ngayHienTaiTime = new Date(ngayHienTai).getTime();

  // Tính số ngày đã trôi qua kể từ ngày bắt đầu
  const soNgayDaTroiQua = Math.floor(
    (ngayHienTaiTime - ngayBatDauTime) / (1000 * 60 * 60 * 24)
  );

  // Tìm ngày hiện tại trong chu kỳ
  const ngayTrongChuKy = (soNgayDaTroiQua % chuKy) + 1;

  return ngayTrongChuKy;
}

exports.createFirstChecklist = async (req, res, next) => {
  try {
    const userData = req.user.data;
    const { ID_Calv, ID_KhoiCV, Giobd, Ngay, Tenca } = req.body;
    // Validate request
    if (!ID_Calv) {
      res.status(400).json({
        message: "Phải chọn ca làm việc!",
      });
      return;
    }

    const calvData = await Ent_calv.findOne({
      where: { ID_Calv: ID_Calv, isDelete: 0, ID_KhoiCV: ID_KhoiCV },
      attributes: ["Giobatdau", "Gioketthuc", "isDelete", "ID_KhoiCV", "Tenca"],
    });

    const khoiData = await Ent_duan_khoicv.findOne({
      where: { ID_KhoiCV: ID_KhoiCV, ID_Duan: userData.ID_Duan, isDelete: 0 },
      attributes: ["Ngaybatdau", "Chuky", "isDelete", "ID_Duan"],
    });

    const formattedDateNow = moment(khoiData.Ngaybatdau)
      .startOf("day")
      .format("DD-MM-YYYY");
    const nowFormattedDate = moment(Ngay).startOf("day").format("YYYY-MM-DD");
    const yesterday = moment(Ngay)
      .subtract(1, "day")
      .startOf("day")
      .format("YYYY-MM-DD");
    const formattedDatePrev = moment(Ngay)
      .add(1, "days") // Thêm 1 ngày vào ngày hiện tại
      .startOf("day")
      .format("YYYY-MM-DD");

    const formattedDate = moment(khoiData.Ngaybatdau)
      .startOf("day")
      .format("YYYY-MM-DD");

    const daysDifference = moment(formattedDatePrev).diff(
      moment(formattedDate),
      "days"
    );

    if (daysDifference <= 0) {
      return res.status(400).json({
        message: `Chưa đến ngày tạo ca, ngày thực hiện sẽ là ngày ${formattedDateNow}!`,
      });
    }

    let ngayCheck = 0;

    ngayCheck = getCurrentDayInCycle(khoiData.Ngaybatdau, Ngay, khoiData.Chuky);
    if (!calvData) {
      return res.status(400).json({
        message: "Ca làm việc không tồn tại!",
      });
    }
    const { Giobatdau, Gioketthuc } = calvData;

    if (
      (Giobd <= Giobatdau || Giobd >= Gioketthuc) &&
      Giobatdau <= Gioketthuc
    ) {
      return res.status(400).json({
        message: "Giờ bắt đầu không thuộc khoảng thời gian \n của ca làm việc!",
      });
    }

    if (Giobd <= Giobatdau && Giobd >= Gioketthuc && Giobatdau >= Gioketthuc) {
      return res.status(400).json({
        message: "Giờ bắt đầu không thuộc khoảng thời gian \n của ca làm việc!",
      });
    }

    if (Giobatdau >= Gioketthuc && Giobd <= Giobatdau) {
      ngayCheck = ngayCheck - 1 == 0 ? khoiData.Chuky : ngayCheck - 1;
    }

    // console.log('ngayCheck', ngayCheck)

    const thietlapcaData = await Ent_thietlapca.findOne({
      attributes: [
        "ID_ThietLapCa",
        "Ngaythu",
        "ID_Calv",
        "ID_Hangmucs",
        "ID_Duan",
        "isDelete",
      ],
      where: [
        {
          Ngaythu: ngayCheck,
          ID_Calv: ID_Calv,
          ID_Duan: userData.ID_Duan,
          isDelete: 0,
        },
      ],
    });

    if (!thietlapcaData) {
      return res.status(400).json({
        message: `
          <span style="font-size: 18px;">Chưa thiết lập ca cho ngày thứ: <b>${ngayCheck}</b> của ca làm việc: <b>${Tenca}</b>.<br>
          Vui lòng lên web:<br>
          B1: Vào chia ca chọn mục tạo<br>
          B2: Thiết lập ngày thực hiện, ca làm việc<br>
          B3: Chọn hạng mục cần thiết lập<br>
          B4: Lưu</span>
        `,
      });
    }

    const checklistData = await Ent_checklist.findAndCountAll({
      attributes: [
        "ID_Checklist",
        "ID_Khuvuc",
        "ID_Hangmuc",
        "Sothutu",
        "Maso",
        "MaQrCode",
        "Checklist",
        "Ghichu",
        "Tieuchuan",
        "Giatridinhdanh",
        "isCheck",
        "Giatrinhan",
        "ID_User",
        "sCalv",
        "calv_1",
        "calv_2",
        "calv_3",
        "calv_4",
        "isDelete",
      ],
      include: [
        {
          model: Ent_hangmuc,
          as: "ent_hangmuc",
          attributes: [
            "Hangmuc",
            "Tieuchuankt",
            "ID_Hangmuc",
            "ID_Khuvuc",
            "FileTieuChuan",
            "isDelete",
          ],
          where: {
            ID_Hangmuc: {
              [Op.in]: thietlapcaData.ID_Hangmucs,
            },
            isDelete: 0,
          },
        },
        {
          model: Ent_khuvuc,
          attributes: [
            "Tenkhuvuc",
            "MaQrCode",
            "Makhuvuc",
            "Sothutu",

            "ID_Khuvuc",
            "ID_KhoiCVs",
            "isDelete",
          ],
          include: [
            {
              model: Ent_khuvuc_khoicv,
              attributes: ["ID_KV_CV", "ID_Khuvuc", "ID_KhoiCV"],
              include: [
                {
                  model: Ent_khoicv,
                  attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
                },
              ],
              where: {
                ID_KhoiCV: userData?.ID_KhoiCV,
              },
            },
            {
              model: Ent_toanha,
              attributes: ["Toanha", "ID_Toanha"],
              include: {
                model: Ent_duan,
                attributes: ["ID_Duan", "Duan", "Diachi", "Vido", "Kinhdo"],
                where: { ID_Duan: userData.ID_Duan },
              },
            },
          ],
          where: {
            isDelete: 0,
          },
        },
        {
          model: Ent_user,
          include: {
            model: Ent_chucvu,
            attributes: ["Chucvu", "Role"],
          },
          attributes: ["UserName", "Email"],
        },
      ],
      where: {
        isDelete: 0,
      },
      order: [["ID_Khuvuc", "ASC"]],
    });

    Tb_checklistc.findAndCountAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_KhoiCV",
        "ID_User",
        "ID_Calv",
        "ID_ThietLapCa",
        "ID_Hangmucs",
        "TongC",
        "Ngay",
        "Tinhtrang",
      ],
      where: {
        isDelete: 0,
        [Op.and]: [
          {
            Ngay: nowFormattedDate,
          },
          { ID_KhoiCV: userData.ID_KhoiCV },
          { ID_Duan: userData.ID_Duan },
          { ID_User: userData.ID_User },
          { ID_Calv: ID_Calv },
        ],
      },
    })
      .then(({ count, rows }) => {
        // Kiểm tra xem đã có checklist được tạo hay chưa
        if (count === 0) {
          // Nếu không có checklist tồn tại, tạo mới
          const data = {
            ID_User: userData.ID_User,
            ID_Calv: ID_Calv,
            ID_Duan: userData.ID_Duan,
            ID_KhoiCV: userData.ID_KhoiCV,
            ID_ThietLapCa: thietlapcaData.ID_ThietLapCa,
            Giobd: convertTimeFormat(Giobd),
            Ngay: nowFormattedDate,
            TongC: 0,
            Tong: checklistData.count || 0,
            Tinhtrang: 0,
            ID_Hangmucs: thietlapcaData.ID_Hangmucs || null,
            isDelete: 0,
          };

          Tb_checklistc.create(data)
            .then((data) => {
              res.status(200).json({
                message: "Tạo checklist thành công!",
                data: data,
              });
            })
            .catch((err) => {
              res.status(500).json({
                message: err.message || "Lỗi! Vui lòng thử lại sau.",
              });
            });
        } else {
          // Nếu đã có checklist được tạo
          // Kiểm tra xem tất cả các ca checklist đều đã hoàn thành (Tinhtrang === 1)
          const allCompleted = rows.every(
            (checklist) => checklist.dataValues.Tinhtrang === 1
          );
          //
          if (allCompleted) {
            const allCompletedTwo = rows.every(
              (checklist) => checklist.dataValues.ID_Calv !== ID_Calv
            );

            if (allCompletedTwo) {
              const data = {
                ID_User: userData.ID_User,
                ID_Calv: ID_Calv,
                ID_Duan: userData.ID_Duan,
                ID_KhoiCV: userData.ID_KhoiCV,
                Giobd: convertTimeFormat(Giobd),
                ID_ThietLapCa: thietlapcaData.ID_ThietLapCa,
                Ngay: nowFormattedDate,
                TongC: 0,
                Tong: checklistData.count || 0,
                Tinhtrang: 0,
                ID_Hangmucs: thietlapcaData.ID_Hangmucs || null,
                isDelete: 0,
              };

              Tb_checklistc.create(data)
                .then((data) => {
                  res.status(200).json({
                    message: "Tạo checklist thành công!",
                    data: data,
                  });
                })
                .catch((err) => {
                  res.status(500).json({
                    message: err.message || "Lỗi! Vui lòng thử lại sau.",
                  });
                });
            } else {
              res.status(400).json({
                message: "Đã có ca làm việc",
                data: rows,
              });
            }
          } else {
            // Nếu có ít nhất một ca checklist chưa hoàn thành (Tinhtrang !== 1), không cho tạo mới
            res.status(400).json({
              message: "Có ít nhất một ca checklist chưa hoàn thành",
              data: rows,
            });
          }
        }
      })
      .catch((err) => {
        res.status(500).json({
          message: err.message || "Lỗi! Vui lòng thử lại sau.",
        });
      });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.getCheckListc = async (req, res, next) => {
  try {
    const userData = req.user.data;
    if (userData) {
      let whereClause = {
        ID_Duan: userData?.ID_Duan,
        isDelete: 0,
      };

      // Nếu quyền là 1 (ID_Chucvu === 1) thì không cần thêm điều kiện ID_KhoiCV
      if (
        userData.ID_Chucvu !== 1 &&
        userData.ID_Chucvu !== 2 &&
        userData.ID_Chucvu !== 3
      ) {
        whereClause.ID_KhoiCV = userData?.ID_KhoiCV;
        whereClause.ID_User = userData?.ID_User;
      }

      const page = parseInt(req.query.page) || 0;
      const pageSize = parseInt(req.query.limit) || 100; // Số lượng phần tử trên mỗi trang
      const offset = page * pageSize;

      const totalCount = await Tb_checklistc.count({
        attributes: [
          "ID_ChecklistC",
          "ID_Hangmucs",
          "ID_Duan",
          "ID_KhoiCV",
          "ID_Calv",
          "ID_ThietLapCa",
          "Ngay",
          "Giobd",
          "Giochupanh1",
          "Anh1",
          "Giochupanh2",
          "Anh2",
          "Giochupanh3",
          "Anh3",
          "Giochupanh4",
          "Anh4",
          "Giokt",
          "Ghichu",
          "Tinhtrang",
          "isDelete",
        ],
        include: [
          {
            model: Ent_duan,
            attributes: ["ID_Duan", "Duan", "Diachi", "Vido", "Kinhdo"],
          },
          {
            model: Ent_khoicv,
            attributes: ["ID_KhoiCV", "KhoiCV"],
          },
          {
            model: Ent_calv,
            attributes: ["ID_Calv", "Tenca", "Giobatdau", "Gioketthuc"],
          },
          {
            model: Ent_user,
            attributes: ["ID_User", "Hoten", "ID_Chucvu"],
            include: [
              {
                model: Ent_chucvu,
                attributes: ["Chucvu", "Role"],
              },
            ],
          },
        ],
        where: whereClause,
      });
      const totalPages = Math.ceil(totalCount / pageSize);
      await Tb_checklistc.findAll({
        attributes: [
          "ID_ChecklistC",
          "ID_Hangmucs",
          "ID_Duan",
          "ID_KhoiCV",
          "ID_Calv",
          "ID_ThietLapCa",
          "ID_User",
          "Ngay",
          "Tong",
          "TongC",
          "Giobd",
          "Giochupanh1",
          "Anh1",
          "Giochupanh2",
          "Anh2",
          "Giochupanh3",
          "Anh3",
          "Giochupanh4",
          "Anh4",
          "Giokt",
          "Ghichu",
          "Tinhtrang",
          "isDelete",
        ],
        include: [
          {
            model: Ent_duan,
            attributes: ["ID_Duan", "Duan", "Diachi", "Vido", "Kinhdo"],
          },
          {
            model: Ent_thietlapca,
            attributes: ["Ngaythu", "isDelete"],
          },
          {
            model: Ent_khoicv,
            attributes: ["ID_KhoiCV", "KhoiCV"],
          },
          {
            model: Ent_calv,
            attributes: ["ID_Calv", "Tenca", "Giobatdau", "Gioketthuc"],
          },
          {
            model: Ent_user,
            attributes: ["ID_User", "Hoten", "ID_Chucvu"],

            include: [
              {
                model: Ent_chucvu,
                attributes: ["Chucvu", "Role"],
              },
            ],
          },
        ],
        where: whereClause,
        order: [
          ["Ngay", "DESC"],
          ["ID_ChecklistC", "DESC"],
        ],
        offset: offset,
        limit: pageSize,
      })
        .then((data) => {
          if (data) {
            res.status(200).json({
              message: "Danh sách checklistc!",
              page: page,
              pageSize: pageSize,
              totalPages: totalPages,
              data: data,
            });
          } else {
            res.status(400).json({
              message: "Không có checklistc!",
              data: [],
            });
          }
        })
        .catch((err) => {
          res.status(500).json({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    } else {
      return res.status(401).json({
        message: "Bạn không có quyền truy cập",
      });
    }
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.getThongKe = async (req, res, next) => {
  try {
    const userData = req.user.data;
    if (userData) {
      const fromDate = req.body.fromDate;
      const toDate = req.body.toDate;
      const ID_Calv = req.body.ID_Calv;
      const orConditions = [
        {
          Ngay: { [Op.between]: [fromDate, toDate] }, // Filter by Ngay attribute between fromDate and toDate
        },
      ];

      if (userData?.ID_KhoiCV !== null && userData?.ID_KhoiCV !== undefined) {
        orConditions.push({ "$tb_checklistc.ID_KhoiCV$": userData?.ID_KhoiCV });
      }

      // orConditions.push({ "$tb_checklistc.ID_KhoiCV$": userData?.ID_KhoiCV });
      orConditions.push({ "$tb_checklistc.ID_Duan$": userData?.ID_Duan });

      if (ID_Calv !== null && ID_Calv !== undefined) {
        orConditions.push({
          "$tb_checklistc.ID_Calv$": ID_Calv,
        });
      }
      const page = parseInt(req.query.page) || 0;
      const pageSize = parseInt(req.query.limit) || 100; // Số lượng phần tử trên mỗi trang
      const offset = page * pageSize;

      const totalCount = await Tb_checklistc.count({
        attributes: [
          "ID_ChecklistC",
          "ID_Hangmucs",
          "ID_Duan",
          "ID_KhoiCV",
          "ID_Calv",
          "ID_ThietLapCa",
          "Ngay",
          "Giobd",
          "Giochupanh1",
          "Anh1",
          "Giochupanh2",
          "Anh2",
          "Giochupanh3",
          "Anh3",
          "Giochupanh4",
          "Anh4",
          "Giokt",
          "Ghichu",
          "Tinhtrang",
          "isDelete",
        ],
        include: [
          {
            model: Ent_duan,
            attributes: ["ID_Duan", "Duan", "Diachi", "Vido", "Kinhdo"],
          },
          {
            model: Ent_khoicv,
            attributes: ["ID_KhoiCV", "KhoiCV"],
          },
          {
            model: Ent_calv,
            attributes: ["ID_Calv", "Tenca", "Giobatdau", "Gioketthuc"],
          },
          {
            model: Ent_user,
            attributes: ["ID_User", "Hoten", "ID_Chucvu"],
            include: [
              {
                model: Ent_chucvu,
                attributes: ["Chucvu", "Role"],
              },
            ],
          },
        ],
        where: orConditions,
      });
      const totalPages = Math.ceil(totalCount / pageSize);
      await Tb_checklistc.findAll({
        attributes: [
          "ID_ChecklistC",
          "ID_Hangmucs",
          "ID_Duan",
          "ID_KhoiCV",
          "ID_Calv",
          "ID_ThietLapCa",
          "ID_User",
          "Ngay",
          "Tong",
          "TongC",
          "Giobd",
          "Giochupanh1",
          "Anh1",
          "Giochupanh2",
          "Anh2",
          "Giochupanh3",
          "Anh3",
          "Giochupanh4",
          "Anh4",
          "Giokt",
          "Ghichu",
          "Tinhtrang",
          "isDelete",
        ],
        include: [
          {
            model: Ent_duan,
            attributes: ["ID_Duan", "Duan", "Diachi", "Vido", "Kinhdo"],
          },
          {
            model: Ent_thietlapca,
            attributes: ["Ngaythu", "isDelete"],
            where: {
              isDelete: 0,
            },
          },
          {
            model: Ent_khoicv,
            attributes: ["ID_KhoiCV", "KhoiCV"],
          },
          {
            model: Ent_calv,
            attributes: ["ID_Calv", "Tenca", "Giobatdau", "Gioketthuc"],
          },
          {
            model: Ent_user,
            attributes: ["ID_User", "Hoten", "ID_Chucvu"],

            include: [
              {
                model: Ent_chucvu,
                attributes: ["Chucvu", "Role"],
              },
            ],
          },
        ],
        where: orConditions,
        order: [
          ["Ngay", "DESC"],
          ["ID_ChecklistC", "DESC"],
        ],
        offset: offset,
        limit: pageSize,
      })
        .then((data) => {
          if (data) {
            res.status(200).json({
              message: "Danh sách checklistc!",
              page: page,
              pageSize: pageSize,
              totalPages: totalPages,
              data: data,
            });
          } else {
            res.status(400).json({
              message: "Không có checklistc!",
              data: [],
            });
          }
        })
        .catch((err) => {
          res.status(500).json({
            message: err.message || "Lỗi! Vui lòng thử lại sau.",
          });
        });
    } else {
      return res.status(401).json({
        message: "Bạn không có quyền truy cập",
      });
    }
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.getThongKeHangMucQuanTrong = async (req, res, next) => {
  try {
    const { startDate, endDate, ID_KhoiCVs } = req.body;
    const userData = req.user.data;
    const startDateFormat = formatDate(startDate);
    const endDateFormat = formatDate(endDate);

    const startDateShow = formatDateShow(startDate);
    const endDateShow = formatDateEnd(endDate);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(
      "BÁO CÁO TỔNG HỢP CHECKLIST NGĂN NGỪA RỦI RO"
    );

    const khoiCVs = await Ent_khoicv.findAll({
      where: {
        ID_KhoiCV: {
          [Op.in]: ID_KhoiCVs,
        },
      },
      attributes: ["ID_KhoiCV", "KhoiCV"],
    });

    const dataFilter = khoiCVs.map((item) => item.KhoiCV);
    const tenBoPhan = dataFilter.join();

    let whereClause = {
      isDelete: 0,
      Ngay: {
        [Op.gte]: startDateFormat,
        [Op.lte]: endDateFormat,
      },
      "$tb_checklistc.ID_KhoiCV$": {
        [Op.in]: ID_KhoiCVs,
      },
      "$tb_checklistc.ID_Duan$": userData.ID_Duan,
    };

    let whereClauseHangMuc = {
      isDelete: 0,
    };
    whereClauseHangMuc["$ent_khuvuc.ent_toanha.ID_Duan$"] = userData.ID_Duan;
    whereClauseHangMuc["$ent_khuvuc.ent_khuvuc_khoicvs.ID_KhoiCV$"] =
      ID_KhoiCVs;

    // Lấy thông tin hạng mục quan trọng
    const dataHangMucImportant = await Ent_hangmuc.findAll({
      attributes: ["ID_Hangmuc", "Hangmuc"],
      include: [
        {
          model: Ent_khuvuc,
          as: "ent_khuvuc",
          attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],
          include: [
            {
              model: Ent_khuvuc_khoicv,
              as: "ent_khuvuc_khoicvs",
              attributes: ["ID_KhoiCV"],
            },
            {
              model: Ent_toanha,
              attributes: ["Toanha", "ID_Duan"],

              include: [
                {
                  model: Ent_duan,
                  attributes: ["Duan", "Logo"],
                },
              ],
            },
          ],
        },
      ],
      where: whereClauseHangMuc,
    });

    // Tạo map để tra cứu tên hạng mục từ ID_Hangmuc
    const hangMucMap = {};
    dataHangMucImportant.forEach((item) => {
      hangMucMap[item.ID_Hangmuc] = item.Hangmuc;
    });

    // Lấy dữ liệu checklist chi tiết
    const dataChecklistC = await Tb_checklistchitiet.findAll({
      attributes: [
        "ID_Checklistchitiet",
        "Ketqua",
        "Ghichu",
        "Ngay",
        "isDelete",
      ],
      include: [
        {
          model: Tb_checklistc,
          as: "tb_checklistc",
          attributes: ["ID_KhoiCV", "ID_Duan", "ID_Calv", "Ngay", "isDelete"],
          where: whereClause,
        },
        {
          model: Ent_checklist,
          attributes: ["ID_Hangmuc", "Tinhtrang"],
        },
      ],
    });

    worksheet.columns = [
      { header: "STT", key: "stt", width: 5 },
      { header: "Tên Hạng mục", key: "ten_hangmuc", width: 25 },
      { header: "Đạt", key: "dat", width: 10 },
      { header: "Không đạt", key: "khongdat", width: 15 },
      { header: "Lý do", key: "lydo", width: 20 },
      { header: "Ghi chú", key: "ghichu", width: 25 },
      { header: "Hướng xử lý", key: "huong_xuly", width: 25 },
    ];

    const projectData = dataHangMucImportant
      ? dataHangMucImportant[0].ent_khuvuc.ent_toanha.ent_duan
      : {};
    const projectName = projectData?.Duan || "";
    const projectLogo =
      projectData?.Logo || "https://pmcweb.vn/wp-content/uploads/logo.png";

    // Download the image and add it to the workbook
    const imageResponse = await axios({
      url: projectLogo,
      responseType: "arraybuffer",
    });

    const imageBuffer = Buffer.from(imageResponse.data, "binary");
    const imageId = workbook.addImage({
      buffer: imageBuffer,
      extension: "png",
    });

    worksheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 120, height: 60 },
    });
    worksheet.getRow(1).height = 60;
    worksheet.getRow(2).height = 25;

    worksheet.getCell("A2").value = projectName; // Đặt tên dự án vào ô A2
    worksheet.getCell("A2").alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    worksheet.getCell("A2").font = { size: 14, bold: true }; // Định dạng tên dự án

    worksheet.mergeCells("A1:G1");
    const headerRow = worksheet.getCell("A1");
    headerRow.value = "BÁO CÁO TỔNG HỢP CHECKLIST NGĂN NGỪA RỦI RO";
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.font = { size: 16, bold: true };

    worksheet.mergeCells("A2:G2");
    worksheet.getCell("A2").value =
      startDateShow && endDateShow
        ? `Từ ngày: ${startDateShow}  Đến ngày: ${endDateShow}`
        : `Từ ngày: `;
    worksheet.getCell("A2").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    worksheet.getCell("A2").font = { size: 13, bold: true };

    worksheet.mergeCells("A3:G3");
    worksheet.getCell("A3").value = `Tên bộ phận: ${tenBoPhan}`;
    worksheet.getCell("A3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    worksheet.getCell("A3").font = { size: 13, bold: true };

    const tableHeaderRow = worksheet.getRow(5);
    tableHeaderRow.values = [
      "STT",
      "Tên Hạng mục",
      "Đạt",
      "Không đạt",
      "Lý do",
      "Ghi chú",
      "Hướng xử lý",
    ];
    tableHeaderRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true, // Bật wrap text
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Thêm dữ liệu vào bảng
    dataHangMucImportant.forEach((item, index) => {
      // Lấy thông tin lỗi từ bảng checklist chi tiết
      const checklistCoLoi = dataChecklistC.filter(
        (checklist) => checklist.ent_checklist.ID_Hangmuc === item.ID_Hangmuc
      );

      const soLuongLoi = checklistCoLoi.length;
      const dat = soLuongLoi === 0 ? "X" : "";
      const khongDat = soLuongLoi > 0 ? "X" : "";
      const lyDo = soLuongLoi > 0 ? `Lỗi ${soLuongLoi} điểm` : "";
      const ghiChu =
        checklistCoLoi.length > 0 ? checklistCoLoi[0].Ghichu || "" : "";

      // Kiểm tra tình trạng để điền hướng xử lý
      const tinhTrang =
        checklistCoLoi.length > 0
          ? checklistCoLoi[0].ent_checklist.Tinhtrang
          : null;
      const huongXuLy = tinhTrang === 1 ? "Đang chờ xử lý" : "Đã xử lý xong";

      // Add a new row
      const newRow = worksheet.addRow({
        stt: index + 1,
        ten_hangmuc: hangMucMap[item.ID_Hangmuc] || "",
        dat: dat,
        khongdat: khongDat,
        lydo: lyDo,
        ghichu: ghiChu,
        huong_xuly: huongXuLy,
      });

      // Set alignment and wrap text for the newly added row
      newRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Checklist_Report.xlsx"
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.getPreviewThongKeHangMucQuanTrong = async (req, res, next) => {
  try {
    const { startDate, endDate, ID_KhoiCVs } = req.body;
    const userData = req.user.data;
    const startDateFormat = formatDate(startDate);
    const endDateFormat = formatDate(endDate);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(
      "BÁO CÁO TỔNG HỢP CHECKLIST NGĂN NGỪA RỦI RO"
    );

    let whereClause = {
      isDelete: 0,
      Ngay: {
        [Op.gte]: startDateFormat,
        [Op.lte]: endDateFormat,
      },
      "$tb_checklistc.ID_KhoiCV$": {
        [Op.in]: ID_KhoiCVs,
      },
      "$tb_checklistc.ID_Duan$": userData.ID_Duan,
    };

    let whereClauseHangMuc = {
      isDelete: 0,
    };
    whereClauseHangMuc["$ent_khuvuc.ent_toanha.ID_Duan$"] = userData.ID_Duan;
    whereClauseHangMuc["$ent_khuvuc.ent_khuvuc_khoicvs.ID_KhoiCV$"] =
      ID_KhoiCVs;

    // Lấy thông tin hạng mục quan trọng
    const dataHangMucImportant = await Ent_hangmuc.findAll({
      attributes: ["ID_Hangmuc", "Hangmuc"],
      include: [
        {
          model: Ent_khuvuc,
          as: "ent_khuvuc",
          attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],
          include: [
            {
              model: Ent_khuvuc_khoicv,
              as: "ent_khuvuc_khoicvs",
              attributes: ["ID_KhoiCV"],
            },
            {
              model: Ent_toanha,
              attributes: ["Toanha", "ID_Duan"],

              include: [
                {
                  model: Ent_duan,
                  attributes: ["Duan", "Logo"],
                },
              ],
            },
          ],
        },
      ],
      where: whereClauseHangMuc,
    });

    // Tạo map để tra cứu tên hạng mục từ ID_Hangmuc
    const hangMucMap = {};
    dataHangMucImportant.forEach((item) => {
      hangMucMap[item.ID_Hangmuc] = item.Hangmuc;
    });

    // Lấy dữ liệu checklist chi tiết
    const dataChecklistC = await Tb_checklistchitiet.findAll({
      attributes: [
        "ID_Checklistchitiet",
        "Ketqua",
        "Ghichu",
        "Ngay",
        "isDelete",
      ],
      include: [
        {
          model: Tb_checklistc,
          as: "tb_checklistc",
          attributes: ["ID_KhoiCV", "ID_Duan", "ID_Calv", "Ngay", "isDelete"],
          where: whereClause,
        },
        {
          model: Ent_checklist,
          attributes: ["ID_Hangmuc", "Tinhtrang"],
        },
      ],
    });

    worksheet.columns = [
      { header: "STT", key: "stt", width: 5 },
      { header: "Tên Hạng mục", key: "ten_hangmuc", width: 25 },
      { header: "Đạt", key: "dat", width: 10 },
      { header: "Không đạt", key: "khongdat", width: 15 },
      { header: "Lý do", key: "lydo", width: 20 },
      { header: "Ghi chú", key: "ghichu", width: 25 },
      { header: "Hướng xử lý", key: "huong_xuly", width: 25 },
    ];

    const tableHeaderRow = worksheet.getRow(1);
    tableHeaderRow.values = [
      "STT",
      "Tên Hạng mục",
      "Đạt",
      "Không đạt",
      "Lý do",
      "Ghi chú",
      "Hướng xử lý",
    ];
    tableHeaderRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true, // Bật wrap text
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Thêm dữ liệu vào bảng
    dataHangMucImportant.forEach((item, index) => {
      // Lấy thông tin lỗi từ bảng checklist chi tiết
      const checklistCoLoi = dataChecklistC.filter(
        (checklist) => checklist.ent_checklist.ID_Hangmuc === item.ID_Hangmuc
      );

      const soLuongLoi = checklistCoLoi.length;
      const dat = soLuongLoi === 0 ? "X" : "";
      const khongDat = soLuongLoi > 0 ? "X" : "";
      const lyDo = soLuongLoi > 0 ? `Lỗi ${soLuongLoi} điểm` : "";
      const ghiChu =
        checklistCoLoi.length > 0 ? checklistCoLoi[0].Ghichu || "" : "";

      // Kiểm tra tình trạng để điền hướng xử lý
      const tinhTrang =
        checklistCoLoi.length > 0
          ? checklistCoLoi[0].ent_checklist.Tinhtrang
          : null;
      const huongXuLy = tinhTrang === 1 ? "Đang chờ xử lý" : "Đã xử lý xong";

      // Add a new row
      const newRow = worksheet.addRow({
        stt: index + 1,
        ten_hangmuc: hangMucMap[item.ID_Hangmuc] || "",
        dat: dat,
        khongdat: khongDat,
        lydo: lyDo,
        ghichu: ghiChu,
        huong_xuly: huongXuLy,
      });

      // Set alignment and wrap text for the newly added row
      newRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Checklist_Report.xlsx"
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await workbook.xlsx.load(buffer);
    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      const rowData = [];
      row.eachCell((cell, colNumber) => {
        rowData.push(cell.value);
      });
      rows.push(rowData);
    });

    res.json(rows);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.getBaoCaoChecklistMonths = async (req, res, next) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }

    const startDate = moment(`${year}-${month}-01`)
      .startOf("month")
      .format("YYYY-MM-DD");
    const endDate = moment(`${year}-${month}-01`)
      .endOf("month")
      .format("YYYY-MM-DD");
    const daysInMonth = moment(startDate).daysInMonth();

    // Lấy dữ liệu từ cơ sở dữ liệu
    const dataChecklistCs = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "ID_KhoiCV",
        "isDelete",
      ],
      where: {
        Ngay: { [Op.between]: [startDate, endDate] },
        ID_Duan: {
          [Op.ne]: 1,
        },
        isDelete: 0,
      },
      include: [
        { model: Ent_khoicv, attributes: ["KhoiCV"] },
        { model: Ent_calv, attributes: ["Tenca"] },
        { model: Ent_duan, attributes: ["Duan"] },
      ],
    });

    // Khởi tạo cấu trúc dữ liệu
    const projectData = {};

    dataChecklistCs.forEach((checklistC) => {
      const projectName = checklistC.ent_duan.Duan;
      const date = checklistC.Ngay;
      const khoiName = checklistC.ent_khoicv.KhoiCV;
      const shiftName = checklistC.ent_calv.Tenca;

      if (!projectData[projectName]) projectData[projectName] = {};
      if (!projectData[projectName][date]) projectData[projectName][date] = {};
      if (!projectData[projectName][date][khoiName])
        projectData[projectName][date][khoiName] = {};
      if (!projectData[projectName][date][khoiName][shiftName]) {
        projectData[projectName][date][khoiName][shiftName] = {
          totalTongC: 0,
          totalTong: checklistC.Tong,
        };
      }

      projectData[projectName][date][khoiName][shiftName].totalTongC +=
        checklistC.TongC;
    });

    // Khởi tạo file Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Báo cáo Checklist");

    // Tạo tiêu đề chính và cột "Tên dự án"
    worksheet.mergeCells("A1", "A2");
    worksheet.getCell("A1").value = "STT";
    worksheet.mergeCells("B1", "B2");
    worksheet.getCell("B1").value = "Tên dự án";
    worksheet.getCell("B1").font = { bold: true };
    // Set the width of the "Tên dự án" column (Column B) dynamically
    worksheet.getColumn(2).width = 30; // Set the width to 30 (you can adjust this value)


    // Tạo các cột cho từng ngày trong tháng với các khối KT, AN, LS, DV, F&B
    for (let day = 1; day <= daysInMonth; day++) {
      const colIndex = (day - 1) * 5 + 3; // Tính toán vị trí cột
      const colRange =
        worksheet.getCell(1, colIndex).address +
        ":" +
        worksheet.getCell(1, colIndex + 4).address;

      worksheet.mergeCells(colRange);
      worksheet.getCell(1, colIndex).value = `Ngày ${day}`;

      // Căn giữa và để chữ đậm cho ngày
      worksheet.getCell(1, colIndex).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      worksheet.getCell(1, colIndex).font = { bold: true };

      // Tạo tiêu đề cho các khối
      worksheet.getCell(2, colIndex).value = "KT";
      worksheet.getCell(2, colIndex + 1).value = "AN";
      worksheet.getCell(2, colIndex + 2).value = "LS";
      worksheet.getCell(2, colIndex + 3).value = "DV";
      worksheet.getCell(2, colIndex + 4).value = "FB";

      // Căn giữa và để chữ đậm cho các tiêu đề
      worksheet.getCell(2, colIndex).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      worksheet.getCell(2, colIndex).font = { bold: true };
      worksheet.getCell(2, colIndex + 1).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      worksheet.getCell(2, colIndex + 1).font = { bold: true };
      worksheet.getCell(2, colIndex + 2).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      worksheet.getCell(2, colIndex + 2).font = { bold: true };
      worksheet.getCell(2, colIndex + 3).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      worksheet.getCell(2, colIndex + 4).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      worksheet.getCell(2, colIndex + 3).font = { bold: true };
      worksheet.getCell(2, colIndex + 4).font = { bold: true };

    }

    let rowIndex = 3; // Bắt đầu từ dòng thứ 3 (sau tiêu đề)

    // Duyệt qua từng dự án và tạo hàng dữ liệu
    Object.keys(projectData).forEach((projectName, projectIndex) => {
      const row = worksheet.getRow(rowIndex);
      row.getCell(1).value = projectIndex + 1; // STT
      row.getCell(2).value = projectName; // Tên dự án

      // Lấy dữ liệu từng ngày cho dự án
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = moment(`${year}-${month}-${day}`, "YYYY-MM-DD").format(
          "YYYY-MM-DD"
        );
        const dayData = projectData[projectName][dateStr] || {};

        // Duyệt qua từng khối và ca trong ngày
        [
          "Khối kỹ thuật",
          "Khối bảo vệ",
          "Khối làm sạch",
          "Khối dịch vụ",
          "Khối F&B",
        ].forEach((khoiName, index) => {
          const colIndex = (day - 1) * 5 + 3 + index;
          let totalCompletion = 0;
          let countShifts = 0;

          if (dayData[khoiName]) {
            Object.values(dayData[khoiName]).forEach((shiftData) => {
              if (shiftData.totalTong > 0) {
                const completionRate =
                  (shiftData.totalTongC / shiftData.totalTong) * 100;
                totalCompletion += Math.min(completionRate, 100); // Giới hạn tối đa 100%
                countShifts++;
              }
            });
          }

          // Tính trung bình tỷ lệ hoàn thành cho các ca trong khối
          let avgCompletion =
            countShifts > 0 ? totalCompletion / countShifts : ""; // Trả về rỗng nếu không có ca

          // Kiểm tra nếu avgCompletion là số nguyên hoặc bằng 100 hoặc 90
          if (
            typeof avgCompletion === "number" &&
            Number.isInteger(avgCompletion)
          ) {
            row.getCell(colIndex).value = Number(avgCompletion); // Để nguyên giá trị
          } else if (avgCompletion !== "") {
            row.getCell(colIndex).value = Number(avgCompletion.toFixed(2)); // Dùng toFixed(2) cho số không chẵn
          } else {
            row.getCell(colIndex).value = ""; // Đảm bảo ô là rỗng nếu không có dữ liệu
          }
        });
      }

      rowIndex++;
    });

    // Create a buffer and write the workbook to it
    const buffer = await workbook.xlsx.writeBuffer();

    // Set headers for file download
    res.set({
      "Content-Disposition": `attachment; filename=Bao_cao_checklist_du_an_${month}_${year}.xlsx`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // Send the buffer as the response
    res.send(buffer);
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.getDetail = async (req, res) => {
  try {
    const userData = req.user.data;
    if (req.params.id && userData) {
      await Tb_checklistc.findByPk(req.params.id, {
        attributes: [
          "ID_ChecklistC",
          "ID_Hangmucs",
          "ID_Duan",
          "ID_KhoiCV",
          "ID_Calv",
          "ID_ThietLapCa",
          "ID_User",
          "Ngay",
          "Giobd",
          "Giochupanh1",
          "Anh1",
          "Giochupanh2",
          "Anh2",
          "Giochupanh3",
          "Anh3",
          "Giochupanh4",
          "Anh4",
          "Giokt",
          "Ghichu",
          "Tinhtrang",
          "isDelete",
        ],
        include: [
          {
            model: Ent_duan,
            attributes: ["ID_Duan", "Duan", "Diachi", "Vido", "Kinhdo"],
          },
          {
            model: Ent_khoicv,
            attributes: ["ID_KhoiCV", "KhoiCV"],
          },
          {
            model: Ent_calv,
            attributes: ["ID_Calv", "Tenca", "Giobatdau", "Gioketthuc"],
          },
          {
            model: Ent_user,
            attributes: ["ID_User", "Hoten", "ID_Chucvu"],
            include: [
              {
                model: Ent_chucvu,
                attributes: ["Chucvu", "Role"],
              },
            ],
          },
        ],
        where: {
          isDelete: 0,
        },
      })
        .then((data) => {
          if (data) {
            res.status(200).json({
              message: "Checklistc chi tiết!",
              data: data,
            });
          } else {
            res.status(400).json({
              message: "Không có checklist cần tìm!",
            });
          }
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

exports.close = async (req, res) => {
  try {
    const userData = req.user.data;
    if (req.params.id && userData) {
      Tb_checklistc.update(
        { Tinhtrang: 1, Giokt: req.body.Giokt },
        {
          where: {
            ID_ChecklistC: req.params.id,
          },
        }
      )
        .then((data) => {
          res.status(200).json({
            message: "Khóa ca thành công!",
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

exports.open = async (req, res) => {
  try {
    const userData = req.user.data;

    if (
      req.params.id &&
      (userData.ID_Chucvu === 1 ||
        userData.ID_Chucvu === 2 ||
        userData.ID_Chucvu === 3)
    ) {
      // Truy vấn ngày từ cơ sở dữ liệu
      const checklist = await Tb_checklistc.findOne({
        attributes: [
          "ID_ChecklistC",
          "ID_Hangmucs",
          "ID_Duan",
          "ID_KhoiCV",
          "ID_Calv",
          "ID_ThietLapCa",
          "Ngay",
          "Giobd",
          "Giochupanh1",
          "Anh1",
          "Giochupanh2",
          "Anh2",
          "Giochupanh3",
          "Anh3",
          "Giochupanh4",
          "Anh4",
          "Giokt",
          "Ghichu",
          "Tinhtrang",
          "isDelete",
        ],
        include: [
          {
            model: Ent_duan,
            attributes: ["ID_Duan", "Duan", "Diachi", "Vido", "Kinhdo"],
          },
          {
            model: Ent_khoicv,
            attributes: ["ID_KhoiCV", "KhoiCV"],
          },
          {
            model: Ent_calv,
            attributes: ["ID_Calv", "Tenca", "Giobatdau", "Gioketthuc"],
          },
          {
            model: Ent_user,
            attributes: ["ID_User", "Hoten", "ID_Chucvu"],
            include: [
              {
                model: Ent_chucvu,
                attributes: ["Chucvu", "Role"],
              },
            ],
          },
        ],
        where: { ID_ChecklistC: req.params.id },
      });

      if (checklist) {
        const currentDay = new Date();
        const checklistDay = new Date(checklist.Ngay); // Giả sử cột ngày trong bảng là 'Ngay'

        // So sánh ngày hiện tại và ngày từ cơ sở dữ liệu
        if (currentDay.toDateString() === checklistDay.toDateString()) {
          // Ngày hiện tại bằng với ngày trong cơ sở dữ liệu, cho phép cập nhật
          await Tb_checklistc.update(
            { Tinhtrang: 0 },
            {
              where: { ID_ChecklistC: req.params.id },
            }
          );
          res.status(200).json({
            message: "Mở ca thành công!",
          });
        } else if (currentDay > checklistDay) {
          // Ngày hiện tại lớn hơn ngày từ cơ sở dữ liệu
          res.status(400).json({
            message: "Ngày khóa ca nhỏ hơn ngày hiện tại",
          });
        } else {
          // Ngày hiện tại nhỏ hơn ngày từ cơ sở dữ liệu (nếu có trường hợp này)
          res.status(400).json({
            message: "Không thể mở ca trước ngày đã khóa",
          });
        }
      } else {
        res.status(404).json({
          message: "Không tìm thấy bản ghi",
        });
      }
    } else {
      res.status(400).json({
        message: "Không có quyền chỉnh sửa",
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
    const ID_ChecklistC = req.params.id;

    if (req.params.id && userData) {
      Tb_checklistc.update(
        { isDelete: 1 },
        {
          where: {
            ID_ChecklistC: ID_ChecklistC,
          },
        }
      )
        .then((data) => {
          res.status(200).json({
            message: "Xoá ca thành công!",
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

exports.updateTongC = async (req, res) => {
  try {
    if (req.params.id1) {
      Tb_checklistc.update(
        { TongC: req.params.id2 },
        {
          where: {
            ID_ChecklistC: req.params.id1,
          },
        }
      )
        .then((data) => {
          res.status(200).json({
            message: "Done!",
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

exports.checklistImages = async (req, res) => {
  try {
    const userData = req.user.data;
    const ID_Checklist = req.params.id;
    if (userData && ID_Checklist) {
      let images = req.files;

      const uploadedFileIds = [];

      for (let f = 0; f < images.length; f += 1) {
        const fileId = await uploadFile(images[f]); // Upload file and get its id
        uploadedFileIds.push(fileId); // Push id to array
      }

      const reqData = {};

      // Populate reqData with available image data
      for (let i = 1; i <= 4; i++) {
        const imageKey = `Anh${i}`;
        const timestampKey = `Giochupanh${i}`;
        if (req.body[imageKey]) {
          const imagePath = uploadedFileIds.find(
            (file) => file.name === req.body[imageKey]
          )?.id;
          //  ;
          if (imagePath) {
            reqData[imageKey] = imagePath;
            reqData[timestampKey] = req.body[timestampKey] || "";
          }
        }
      }

      // Perform update only if reqData contains any data
      if (Object.keys(reqData).length > 0) {
        await Tb_checklistc.update(reqData, {
          where: { ID_ChecklistC: ID_Checklist },
        });

        res.status(200).json({ message: "Cập nhật khu vực thành công!" });
      } else {
        res
          .status(400)
          .json({ message: "Không có dữ liệu hình ảnh hợp lệ để cập nhật!" });
      }
    } else {
      res
        .status(401)
        .json({ message: "Bạn không có quyền truy cập! Vui lòng thử lại" });
    }
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};


exports.checklistCalv = async (req, res) => {
  try {
    const userData = req.user.data;
    if (userData) {
      const ID_ChecklistC = req.params.id;
      let whereClause = {
        isDelete: 0,
        ID_ChecklistC: ID_ChecklistC,
        ID_Duan: userData.ID_Duan,
      };

      // Fetch checklist detail items
      const dataChecklistChiTiet = await Tb_checklistchitiet.findAll({
        attributes: [
          "ID_Checklistchitiet",
          "ID_ChecklistC",
          "ID_Checklist",
          "Ketqua",
          "Anh",
          "Gioht",
          "Ghichu",
          "isScan",
          "isCheckListLai",
          "isDelete",
        ],
        include: [
          {
            model: Tb_checklistc,
            as: "tb_checklistc",
            attributes: [
              "ID_ChecklistC",
              "Ngay",
              "Giobd",
              "Giokt",
              "ID_KhoiCV",
              "ID_Calv",
              "ID_Duan",
            ],
            where: whereClause,
            include: [
              {
                model: Ent_khoicv,
                attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
              },
              {
                model: Ent_calv,
                attributes: ["Tenca", "Giobatdau", "Gioketthuc"],
              },
            ],
          },
          {
            model: Ent_checklist,
            attributes: [
              "ID_Checklist",
              "ID_Hangmuc",
              "ID_Tang",
              "Sothutu",
              "Maso",
              "MaQrCode",
              "Checklist",
              "Giatridinhdanh",
              "Giatriloi",
              "isCheck",
              "Tinhtrang",
              "Giatrinhan",
            ],
            include: [
              {
                model: Ent_hangmuc,
                as: "ent_hangmuc",
                attributes: ["Hangmuc", "ID_Khuvuc", "MaQrCode", "Tieuchuankt"],
              },
              {
                model: Ent_khuvuc,
                attributes: ["Tenkhuvuc", "MaQrCode", "ID_Khuvuc"],
                include: [
                  {
                    model: Ent_toanha,
                    attributes: ["Toanha", "ID_Toanha"],
                  },
                ],
              },
              {
                model: Ent_tang,
                attributes: ["Tentang"],
              },
              {
                model: Ent_user,
                attributes: ["UserName", "Hoten", "Sodienthoai"],
              },
            ],
          },
        ],
      });

      // Convert fetched data to plain JavaScript objects
      const plainChecklistChiTiet = dataChecklistChiTiet.map((item) =>
        item.get({ plain: true })
      );

      // Fetch checklist done items
      const checklistDoneItems = await Tb_checklistchitietdone.findAll({
        attributes: [
          "ID_Checklistchitietdone",
          "Description",
          "isDelete",
          "ID_ChecklistC",
          "Gioht",
          "isScan",
          "isCheckListLai",
        ],
        where: { isDelete: 0, ID_ChecklistC: ID_ChecklistC },
      });

      // Convert done items to plain objects
      const plainChecklistDoneItems = checklistDoneItems.map((item) =>
        item.get({ plain: true })
      );

      const arrPush = [];
      let checklistIds = [];
      const itemDoneList = [];

      // Populate arrPush and collect checklist IDs
      plainChecklistChiTiet.forEach((item) => {
        item.status = 0;
        if (item.isScan === 1) {
          item.ent_checklist.ent_hangmuc = { ...item.ent_checklist.ent_hangmuc, isScan: 1 };
        }
        arrPush.push(item);
        // checklistIds.push(item.ID_Checklist);
      });

      // Process done items for checklist ID mapping
      plainChecklistDoneItems.forEach((item) => {
        const idChecklists = item.Description.split(",").map(Number);
        idChecklists.forEach((id) => {
          itemDoneList.push({
            ...item,
            ID_Checklist: id,
            Description: id.toString(),
          });
        });
        idChecklists.forEach((id) => {
          //checklistGiohtMap.set(id, item.Gioht);
          checklistIds.push(id);
        });
      });

      // Fetch related checklist data
      const relatedChecklists = await Ent_checklist.findAll({
        attributes: [
          "ID_Checklist",
          "ID_Hangmuc",
          "ID_Khuvuc",
          "ID_Tang",
          "Sothutu",
          "Maso",
          "MaQrCode",
          "Checklist",
          "Giatridinhdanh",
          "isCheck",
          "Tinhtrang",
          "Giatrinhan",
        ],
        include: [
          {
            model: Ent_hangmuc,
            as: "ent_hangmuc",
            attributes: [
              "Hangmuc",
              "Tieuchuankt",
              "ID_Khuvuc",
              "MaQrCode",
              "FileTieuChuan",
            ],
          },
          {
            model: Ent_khuvuc,
            as: "ent_khuvuc",
            attributes: [
              "Tenkhuvuc",
              "MaQrCode",
              "Makhuvuc",
              "Sothutu",
              "ID_Khuvuc",
            ],
            include: [
              {
                model: Ent_toanha,
                attributes: ["Toanha", "ID_Toanha"],
              },
            ],
          },
          {
            model: Ent_tang,
            attributes: ["Tentang"],
          },
        ],
        where: {
          ID_Checklist: {
            [Op.in]: checklistIds,
          },
        },
      });

      const plainRelatedChecklists = relatedChecklists.map((item) =>
        item.get({ plain: true })
      );

      itemDoneList.forEach((item) => {
        const relatedChecklist = plainRelatedChecklists.find(
          (rl) => rl.ID_Checklist === item.ID_Checklist
        );

        if (relatedChecklist) {
          item.ent_checklist = {
            ...relatedChecklist,
            //ent_hangmuc: relatedChecklist.ent_hangmuc
          };
          (item.Ketqua = relatedChecklist.Giatridinhdanh || ""),
            (item.status = 1);
          arrPush.push(item);
        }
      });

      // Fetch data for Tb_checklistc with plain transformation
      const dataChecklistC = await Tb_checklistc.findByPk(ID_ChecklistC, {
        attributes: [
          "Ngay",
          "ID_KhoiCV",
          "ID_ThietLapCa",
          "ID_Duan",
          "Tinhtrang",
          "ID_Hangmucs",
          "Giobd",
          "Giokt",
          "ID_User",
          "ID_Calv",
          "isDelete",
        ],
        include: [
          { model: Ent_duan, attributes: ["Duan"] },
          { model: Ent_thietlapca, attributes: ["Ngaythu"] },
          { model: Ent_khoicv, attributes: ["KhoiCV", "Ngaybatdau", "Chuky"] },
          { model: Ent_calv, attributes: ["Tenca", "Giobatdau", "Gioketthuc"] },
          {
            model: Ent_user,
            include: { model: Ent_chucvu, attributes: ["Chucvu", "Role"] },
            attributes: ["UserName", "Email", "Hoten"],
          },
        ],
        where: { isDelete: 0 },
      });

      res.status(200).json({
        message: "Danh sách checklist",
        data: arrPush,
        dataChecklistC: dataChecklistC,
      });
    }
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.reportLocation = async (req, res) => {
  try {
    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");

    // Fetch checklist data with related information
    const dataChecklistC = await Tb_checklistc.findAll({
      attributes: [
        "Ngay",
        "ID_KhoiCV",
        "ID_ChecklistC",
        "ID_ThietLapCa",
        "ID_Duan",
        "Tinhtrang",
        "Giobd",
        "Giokt",
        "ID_User",
        "ID_Calv",
        "isDelete",
      ],
      include: [
        {
          model: Ent_duan,
          attributes: ["Duan"],
        },
        {
          model: Ent_thietlapca,
          attributes: ["Ngaythu"],
        },
        {
          model: Ent_khoicv,
          attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
        },
        {
          model: Ent_calv,
          attributes: ["Tenca"],
        },
        {
          model: Ent_user,
          include: {
            model: Ent_chucvu,
            attributes: ["Chucvu", "Role"],
          },
          attributes: ["UserName", "Email", "Hoten"],
        },
        {
          model: Tb_checklistchitietdone,
          as: "tb_checklistchitietdones",
          attributes: [
            "Description",
            "isDelete",
            "ID_ChecklistC",
            "Gioht",
            "Vido",
            "Kinhdo",
          ],
        },
      ],
      where: {
        isDelete: 0,
        Ngay: yesterday,
      },
    });

    const results = dataChecklistC.map((checklist) => {
      const tbChecklistChiTiet = checklist.tb_checklistchitietdones;

      // Create a Map to group checklist items by Vido and Kinhdo
      const coordinatesMap = new Map();

      // Loop through checklistChiTiet to group by Vido and Kinhdo
      tbChecklistChiTiet.forEach((item) => {
        const { Vido, Kinhdo, Description, Gioht } = item;

        // If Vido and Kinhdo exist, proceed
        if (Vido && Kinhdo) {
          const coordKey = `${Vido},${Kinhdo}`; // Create a unique key based on Vido and Kinhdo

          // Convert Gioht to total seconds
          const [hours, minutes, seconds] = Gioht.split(":").map(Number);
          const currentTimeInSeconds = hours * 3600 + minutes * 60 + seconds;

          // If the coordinates exist in the map
          if (coordinatesMap.has(coordKey)) {
            const existingItems = coordinatesMap.get(coordKey);

            // Check if the current item is within 15 seconds of any existing item
            const isWithinTimeRange = existingItems.some((existingItem) => {
              const [existingHours, existingMinutes, existingSeconds] = existingItem.Gioht
                .split(":")
                .map(Number);
              const existingTimeInSeconds =
                existingHours * 3600 + existingMinutes * 60 + existingSeconds;

              const timeDiffInSeconds = Math.abs(
                currentTimeInSeconds - existingTimeInSeconds
              );
              return timeDiffInSeconds <= 10; // Compare with a 10-second threshold
            });

            if (isWithinTimeRange) {
              existingItems.push(item); // Add to the existing list if within time range
            }
          } else {
            // Otherwise, create a new entry for the coordinates
            coordinatesMap.set(coordKey, [item]);
          }
        }
      });

      // Now, coordinatesMap contains groups of checklist items with the same coordinates
      // To get the result, filter out entries with more than one item (duplicates)
      const duplicateCoordinates = [];
      coordinatesMap.forEach((items, key) => {
        if (items.length > 1) {
          duplicateCoordinates.push({
            coordinates: key, // Vido, Kinhdo key
            checklistItems: items.map((item) => {
              // Extract checklist IDs from Description
              const checklistIds = item.Description.split(",").map(Number);
              return {
                Gioht: item.Gioht,
                checklistIds, // IDs from Description
              };
            }),
          });
        }
      });

      return {
        project: checklist.ent_duan.Duan,
        id: checklist.ID_ChecklistC,
        ca: checklist.ent_calv.Tenca,
        nguoi: checklist.ent_user.Hoten,
        cv: checklist.ent_khoicv.KhoiCV,
        duplicateCoordinates, // Group of duplicate coordinates
      };
    });

    // Fetch related checklist details, including Hangmuc, Khuvuc, and Tang (Floor)
    const relatedChecklists = await Ent_checklist.findAll({
      attributes: ["ID_Checklist"],
      include: [
        {
          model: Ent_hangmuc,
          as: "ent_hangmuc",
          attributes: ["Hangmuc"], // Fetch only the Hangmuc (category name)
        },
        {
          model: Ent_khuvuc,
          as: "ent_khuvuc",
          attributes: ["Tenkhuvuc"], // Fetch Khuvuc (Area)
          include: [
            {
              model: Ent_toanha,
              as: "ent_toanha",
              attributes: ["Toanha"],
            },
          ],
        },
        {
          model: Ent_tang,
          attributes: ["Tentang"], // Fetch Tang (Floor)
        },
      ],
      where: {
        ID_Checklist: {
          [Op.in]: results.flatMap((result) =>
            result.duplicateCoordinates.flatMap((entry) =>
              entry.checklistItems.flatMap((item) => item.checklistIds)
            )
          ),
        },
      },
    });

    // Merge related checklist details with duplicate coordinates
    const resultWithDetails = results.map((result) => {
      const detailedCoordinates = result.duplicateCoordinates.map((entry) => {
        const detailedItems = entry.checklistItems.map((item) => {
          // Get the first related Hangmuc, Khuvuc, and Tentang from the checklist
          const relatedItem = relatedChecklists.find((checklist) =>
            item.checklistIds.includes(checklist.ID_Checklist)
          );
          return {
            Gioht: item.Gioht,
            relatedHangmuc: relatedItem
              ? `${relatedItem.ent_hangmuc.Hangmuc} - ${relatedItem.ent_khuvuc.Tenkhuvuc} - ${relatedItem.ent_tang.Tentang} - ${relatedItem.ent_khuvuc.ent_toanha.Toanha}`
              : null, // Show Hangmuc, Khuvuc (Area), and Tentang (Floor)
          };
        });
        return {
          coordinates: entry.coordinates,
          detailedItems, // Simplified list of detailed items with Hangmuc, Khuvuc, and Tentang
        };
      }).filter((entry) => entry.detailedItems.length > 0); // Filter entries with detailedItems > 0


      return {
        id: result.id,
        project: result.project,
        ca: result.ca,
        nguoi: result.nguoi,
        cv: result.cv,
        detailedCoordinates, // Coordinates with simplified detailed checklist items (Hangmuc, Khuvuc, Tentang)
      };
    }).filter((result) => result.detailedCoordinates.length > 0);

    // Send the final result with details
    res.status(200).json({
      message: "Thống kê checklist với tọa độ trùng",
      data: resultWithDetails, // Send simplified result with Hangmuc, Khuvuc, Tentang
    });
  } catch (err) {
    // Handle errors and send appropriate response
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.getBaoCaoLocationsTimes = async (req, res) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }

    const startDate = moment(`${year}-${month}-01`)
      .startOf("month")
      .format("YYYY-MM-DD");
    const endDate = moment(`${year}-${month}-01`)
      .endOf("month")
      .format("YYYY-MM-DD");
    const daysInMonth = moment(startDate).daysInMonth();

    // Fetch checklist data with related information
    const dataChecklistC = await Tb_checklistc.findAll({
      attributes: [
        "Ngay",
        "ID_KhoiCV",
        "ID_Duan",
        "ID_ChecklistC",
        "ID_ThietLapCa",
        "ID_Duan",
        "Tinhtrang",
        "Giobd",
        "Giokt",
        "Tong",
        "TongC",
        "ID_User",
        "ID_Calv",
        "isDelete",
      ],
      include: [
        {
          model: Ent_duan,
          attributes: ["Duan"],
        },
        {
          model: Ent_thietlapca,
          attributes: ["Ngaythu"],
        },
        {
          model: Ent_khoicv,
          attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
        },
        {
          model: Ent_calv,
          attributes: ["Tenca"],
        },
        {
          model: Ent_user,
          attributes: ["UserName", "Email", "Hoten"],
        },
        {
          model: Tb_checklistchitietdone,
          as: "tb_checklistchitietdones",
          attributes: [
            "Description",
            "isDelete",
            "ID_ChecklistC",
            "Gioht",
            "Vido",
            "Kinhdo",
            "isScan",
          ],
        },
      ],
      where: {
        Ngay: { [Op.between]: [startDate, endDate] },
        ID_Duan: {
          [Op.ne]: 1,
        },
        isDelete: 0,
      },
    });

    const results = dataChecklistC.map((checklist) => {
      const tbChecklistChiTiet = checklist.tb_checklistchitietdones;

      // Create a Map to group checklist items by Vido and Kinhdo
      const coordinatesMap = new Map();

      // Loop through checklistChiTiet to group by Vido and Kinhdo
      tbChecklistChiTiet.forEach((item) => {
        const { Vido, Kinhdo, Description, Gioht, isScan } = item;

        // If Vido and Kinhdo exist, proceed
        if (Gioht) {
          const coordKey = `${Vido} - ${Kinhdo}`; // Create a unique key based on Vido and Kinhdo

          // If the coordinates exist in the map, push the current item
          if (coordinatesMap.has(coordKey)) {
            coordinatesMap.get(coordKey).push(item);
          } else {
            // Otherwise, create a new entry for the coordinates
            coordinatesMap.set(coordKey, [item]);
          }
        }
      });

      // Now, coordinatesMap contains groups of checklist items with the same coordinates
      // To get the result, filter out entries with more than one item (duplicates)
      const duplicateCoordinates = [];
      coordinatesMap.forEach((items, key) => {
        if (items.length > 1) {
          duplicateCoordinates.push({
            coordinates: key, // Vido, Kinhdo key
            checklistItems: items.map((item) => {
              // Extract checklist IDs from Description
              const checklistIds = item.Description.split(",").map(Number);
              return {
                Gioht: item.Gioht,
                isScan: item.isScan,
                checklistIds, // IDs from Description
              };
            }),
          });
        }
      });

      return {
        project: checklist.ent_duan.Duan,
        id: checklist.ID_ChecklistC,
        ca: checklist.ent_calv.Tenca,
        giobd: checklist.Giobd,
        giokt: checklist.Giokt,
        ngay: checklist.Ngay,
        tongC: checklist.TongC,
        tong: checklist.Tong,
        nguoi: checklist.ent_user.Hoten,
        tk: checklist.ent_user.UserName,
        cv: checklist.ent_khoicv.KhoiCV,
        duplicateCoordinates, // Group of duplicate coordinates
      };
    });

    // Fetch related checklist details, including Hangmuc, Khuvuc, and Tang (Floor)
    const relatedChecklists = await Ent_checklist.findAll({
      attributes: ["ID_Checklist", "ID_Tang", "isDelete"],
      include: [
        {
          model: Ent_hangmuc,
          as: "ent_hangmuc",
          attributes: ["Hangmuc"], // Fetch only the Hangmuc (category name)
        },
        {
          model: Ent_khuvuc,
          as: "ent_khuvuc",
          attributes: ["Tenkhuvuc"], // Fetch Khuvuc (Area)
          include: [
            {
              model: Ent_toanha,
              as: "ent_toanha",
              attributes: ["Toanha"],
            },
          ],
        },
        {
          model: Ent_tang,
          attributes: ["Tentang"], // Fetch Tang (Floor)
        },
      ],
      where: {
        ID_Checklist: {
          [Op.in]: results.flatMap((result) =>
            result.duplicateCoordinates.flatMap((entry) =>
              entry.checklistItems.flatMap((item) => item.checklistIds)
            )
          ),
        },
        isDelete: 0,
      },
    });

    const MIN_TRAVERSAL_TIME_BETWEEN_FLOORS = 1 * 10;
    // Merge related checklist details with duplicate coordinates
    const resultWithDetails = results
      .map((result) => {
        const detailedCoordinates = result.duplicateCoordinates
          .map((entry) => {
            // Sort items by Gioht
            const sortedItems = entry.checklistItems.sort(
              (a, b) =>
                moment(a.Gioht, "HH:mm:ss") - moment(b.Gioht, "HH:mm:ss")
            );

            const detailedItems = sortedItems.map((item, index) => {
              const relatedItem = relatedChecklists.find((checklist) =>
                item.checklistIds.includes(checklist.ID_Checklist)
              );
              const floor = relatedItem?.ent_tang?.Tentang || null;

              let isValid = true;

              if (index > 0) {
                const previousItem = sortedItems[index - 1];
                const previousFloor =
                  relatedChecklists.find((checklist) =>
                    previousItem.checklistIds.includes(checklist.ID_Checklist)
                  )?.ent_tang?.Tentang || null;

                // Calculate time difference in seconds
                const timeDifference = moment(item.Gioht, "HH:mm:ss").diff(
                  moment(previousItem.Gioht, "HH:mm:ss"),
                  "seconds"
                );

                // If floors differ and time is too short, flag as invalid
                if (
                  previousFloor !== floor &&
                  timeDifference < MIN_TRAVERSAL_TIME_BETWEEN_FLOORS
                ) {
                  isValid = false;
                }
              }

              return {
                Gioht: item.Gioht,
                isScan: item.isScan,
                relatedHangmuc: relatedItem
                  ? `${relatedItem.ent_hangmuc.Hangmuc} - ${relatedItem.ent_khuvuc.Tenkhuvuc} - ${floor} - ${relatedItem.ent_khuvuc.ent_toanha.Toanha}`
                  : null,
                isValid, // Add validity flag
              };
            });

            // Check if there's any "isValid: false" in this coordinate set
            const hasInvalid = detailedItems.some(
              (item) => item.isValid === false
            );

            // Include this coordinate if it contains any invalid entries
            return hasInvalid
              ? { coordinates: entry.coordinates, detailedItems }
              : null;
          })
          .filter((entry) => entry !== null); // Remove null entries for coordinates without any invalid items

        // Only return results with coordinates that have invalid items
        return detailedCoordinates.length > 0
          ? {
            id: result.id,
            project: result.project,
            ca: result.ca,
            nguoi: result.nguoi,
            tk: result.tk,
            cv: result.cv,
            giobd: result.giobd,
            giokt: result.giokt,
            ngay: result.ngay,
            tongC: result.tongC,
            tong: result.tong,
            detailedCoordinates,
          }
          : null;
      })
      .filter((result) => result !== null); // Remove results without any invalid entries

    const workbook = new ExcelJS.Workbook();

    // Loop through each project with errors and create a sheet
    resultWithDetails.forEach((result) => {
      // Create a new sheet for each project with errors
      let sheet = workbook.getWorksheet(result.project);
      if (!sheet) {
        // Only create a new sheet if it doesn't already exist
        sheet = workbook.addWorksheet(result.project || "Dự án khác");

        // Define columns for the sheet
        sheet.columns = [
          { header: "Ca", key: "ca", width: 15 },
          { header: "Họ tên", key: "nguoi", width: 20 },
          { header: "Tài khoản", key: "kt", width: 20 },
          { header: "Giờ Bắt Đầu", key: "giobd", width: 15 },
          { header: "Giờ Kết Thúc", key: "giokt", width: 15 },
          { header: "Ngày", key: "ngay", width: 15 },
          { header: "Khối", key: "cv", width: 15 },
          { header: "Tọa Độ", key: "coordinates", width: 30 },
          { header: "Giờ HT", key: "gioht", width: 15 },
          { header: "Hạng Mục", key: "relatedHangmuc", width: 50 },
          { header: "Hợp Lệ", key: "isValid", width: 10 },
          { header: "Quét Qr", key: "isScan", width: 10 },
        ];
      }

      // Populate the sheet with the details
      result.detailedCoordinates.forEach((coordinateEntry) => {
        coordinateEntry.detailedItems.forEach((item) => {
          sheet.addRow({
            ca: result.ca,
            nguoi: result.nguoi,
            kt: result.kt,
            giobd: result.giobd,
            giokt: result.giokt,
            ngay: result.ngay,
            cv: result.cv,
            coordinates: coordinateEntry.coordinates,
            gioht: item.Gioht,
            relatedHangmuc: item.relatedHangmuc,
            isValid: item.isValid ? "" : "Cảnh báo",
            isScan: item.isScan == 1 ? "Không quét" : "",
          });
        });
      });
    });
    const buffer = await workbook.xlsx.writeBuffer();

    // Set headers for file download
    res.set({
      "Content-Disposition": `attachment; filename=Bao_cao_checklist_vi_pham_${month}_${year}.xlsx`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // Send the buffer as the response
    res.send(buffer);
  } catch (err) {
    // Handle errors and send appropriate response
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.checklistCalvDinhKy = async (req, res) => {
  try {
    const userData = req.user.data;
    if (userData) {
      const ID_ChecklistC = req.params.id;
      let whereClause = {
        isDelete: 0,
        ID_ChecklistC: ID_ChecklistC,
      };

      // Fetch checklist detail items
      const dataChecklistChiTiet = await Tb_checklistchitiet.findAll({
        attributes: [
          "ID_Checklistchitiet",
          "ID_ChecklistC",
          "ID_Checklist",
          "Ketqua",
          "Anh",
          "Gioht",
          "Ghichu",
          "isDelete",
        ],
        include: [
          {
            model: Tb_checklistc,
            attributes: [
              "ID_ChecklistC",
              "Ngay",
              "Giobd",
              "Giokt",
              "ID_KhoiCV",
              "ID_Calv",
            ],
            where: whereClause,
            include: [
              {
                model: Ent_khoicv,
                attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
              },
              {
                model: Ent_user,
                attributes: ["ID_User", "Hoten", "ID_Chucvu"],
              },
              {
                model: Ent_calv,
                attributes: ["Tenca", "Giobatdau", "Gioketthuc"],
              },
            ],
          },
          {
            model: Ent_checklist,
            attributes: [
              "ID_Checklist",
              "ID_Hangmuc",
              "ID_Tang",
              "Sothutu",
              "Maso",
              "MaQrCode",
              "Checklist",
              "Giatridinhdanh",
              "isCheck",
              "Giatrinhan",
            ],
            include: [
              {
                model: Ent_hangmuc,
                as: "ent_hangmuc",
                attributes: [
                  "Hangmuc",
                  "Tieuchuankt",
                  "ID_Khuvuc",
                  "MaQrCode",
                  "ID_KhoiCV",
                  "FileTieuChuan",
                ],
                include: [
                  {
                    model: Ent_khuvuc,
                    attributes: [
                      "Tenkhuvuc",
                      "MaQrCode",
                      "Makhuvuc",
                      "Sothutu",

                      "ID_KhoiCV",
                      "ID_Khuvuc",
                    ],
                    include: [
                      {
                        model: Ent_toanha,
                        attributes: ["Toanha", "ID_Toanha"],
                        include: {
                          model: Ent_duan,
                          attributes: [
                            "ID_Duan",
                            "Duan",
                            "Diachi",
                            "Vido",
                            "Kinhdo",
                          ],
                          where: { ID_Duan: userData.ID_Duan },
                        },
                      },
                    ],
                  },
                  {
                    model: Ent_khoicv,
                    attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
                  },
                ],
              },
              {
                model: Ent_tang,
                attributes: ["Tentang"],
              },
              {
                model: Ent_user,
                attributes: [
                  "UserName",
                  "Email",
                  "Hoten",
                  "Ngaysinh",
                  "Gioitinh",
                  "Sodienthoai",
                ],
              },
            ],
          },
        ],
      });

      // Fetch checklist done items
      const checklistDoneItems = await Tb_checklistchitietdone.findAll({
        attributes: ["Description", "isDelete", "ID_ChecklistC"],
        where: { isDelete: 0, ID_ChecklistC: ID_ChecklistC },
      });

      const arrPush = [];

      // Add status to dataChecklistChiTiet items if length > 0
      if (dataChecklistChiTiet.length > 0) {
        dataChecklistChiTiet.forEach((item) => {
          arrPush.push({ ...item.dataValues, status: 0 });
        });
      }

      // Extract all ID_Checklist from checklistDoneItems and fetch related data
      let checklistIds = [];
      if (checklistDoneItems.length > 0) {
        checklistDoneItems.forEach((item) => {
          const descriptionArray = JSON.parse(item.dataValues.Description);
          if (Array.isArray(descriptionArray)) {
            descriptionArray.forEach((description) => {
              const splitByComma = description.split(",");
              splitByComma.forEach((splitItem) => {
                const [ID_Checklist] = splitItem.split("/");
                checklistIds.push(parseInt(ID_Checklist));
              });
            });
          } else {
            console.log("descriptionArray is not an array.");
          }
        });
      }

      let initialChecklistIds = checklistIds.filter((id) => !isNaN(id));

      // Fetch related checklist data
      const relatedChecklists = await Ent_checklist.findAll({
        attributes: [
          "ID_Checklist",
          "ID_Hangmuc",
          "ID_Tang",
          "Sothutu",
          "Maso",
          "MaQrCode",
          "Checklist",
          "Giatridinhdanh",
          "isCheck",
          "Giatrinhan",
        ],
        where: {
          ID_Checklist: initialChecklistIds,
        },
        include: [
          {
            model: Ent_hangmuc,
            as: "ent_hangmuc",
            attributes: [
              "Hangmuc",
              "Tieuchuankt",
              "ID_Khuvuc",
              "MaQrCode",
              "ID_KhoiCV",
              "FileTieuChuan",
            ],
            include: [
              {
                model: Ent_khuvuc,
                attributes: [
                  "Tenkhuvuc",
                  "MaQrCode",
                  "Makhuvuc",
                  "Sothutu",

                  "ID_KhoiCV",
                  "ID_Khuvuc",
                ],
                include: [
                  {
                    model: Ent_toanha,
                    attributes: ["Toanha", "ID_Toanha"],
                    include: {
                      model: Ent_duan,
                      attributes: [
                        "ID_Duan",
                        "Duan",
                        "Diachi",
                        "Vido",
                        "Kinhdo",
                      ],
                      where: { ID_Duan: userData.ID_Duan },
                    },
                  },
                ],
              },
              {
                model: Ent_khoicv,
                attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
              },
            ],
          },
          {
            model: Ent_tang,
            attributes: ["Tentang"],
          },
          {
            model: Ent_user,
            attributes: [
              "UserName",
              "Email",
              "Hoten",
              "Ngaysinh",
              "Gioitinh",
              "Sodienthoai",
            ],
          },
        ],
      });

      // Merge checklistDoneItems data into arrPush
      checklistDoneItems.forEach((item) => {
        const descriptionArray = JSON.parse(item.dataValues.Description);
        if (Array.isArray(descriptionArray)) {
          descriptionArray.forEach((description) => {
            const splitByComma = description.split(",");
            splitByComma.forEach((splitItem) => {
              const [ID_Checklist, valueCheck, gioht] = splitItem.split("/");
              const relatedChecklist = relatedChecklists.find(
                (rl) => rl.ID_Checklist === parseInt(ID_Checklist)
              );
              if (relatedChecklist) {
                arrPush.push({
                  ID_Checklist: parseInt(ID_Checklist),
                  Ketqua: valueCheck,
                  Gioht: gioht,
                  status: 1,
                  ent_checklist: relatedChecklist,
                });
              }
            });
          });
        }
      });

      const dataChecklistC = await Tb_checklistc.findByPk(ID_ChecklistC, {
        attributes: [
          "Ngay",
          "ID_KhoiCV",
          "ID_Duan",
          "Tinhtrang",
          "Giobd",
          "Giokt",
          "ID_User",
          "ID_Calv",
          "isDelete",
        ],
        include: [
          {
            model: Ent_duan,
            attributes: ["Duan"],
          },
          {
            model: Ent_khoicv,
            attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
          },
          {
            model: Ent_calv,
            attributes: ["Tenca"],
          },
          {
            model: Ent_user,
            include: {
              model: Ent_chucvu,
              attributes: ["Chucvu", "Role"],
            },
            attributes: ["UserName", "Email"],
          },
          {
            model: Ent_user,
            attributes: ["ID_User", "Hoten", "ID_Chucvu"],
          },
        ],
        where: {
          isDelete: 0,
        },
      });

      res.status(200).json({
        message: "Danh sách checklist",
        data: arrPush,
        dataChecklistC: dataChecklistC,
      });
    }
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.checklistYearByKhoiCV = async (req, res) => {
  try {
    const userData = req.user.data;
    const year = req.query.year || new Date().getFullYear(); // Default to the current year
    const khoi = req.query.khoi;
    const tangGiam = req.query.tangGiam || "desc"; // Sorting order: default to 'desc'

    // Define the where clause for filtering data
    let whereClause = {
      isDelete: 0,
      ID_Duan: userData.ID_Duan, // Filter by project
      Tinhtrang: 1
    };

    if (khoi !== "all") {
      whereClause.ID_KhoiCV = khoi; // Filter by specific work unit if provided
    }

    if (year) {
      whereClause.Ngay = {
        [Op.gte]: `${year}-01-01`,
        [Op.lte]: `${year}-12-31`,
      };
    }

    // Fetch the checklist data with shift (Calv) information
    const relatedChecklists = await Tb_checklistc.findAll({
      attributes: [
        "ID_KhoiCV",
        "Ngay",
        "TongC",
        "Tong",
        "ID_Calv",
        "isDelete",
        "ID_Duan",
        "Tinhtrang"
      ],
      where: whereClause,
      include: [
        {
          model: Ent_khoicv,
          attributes: ["KhoiCV", "isDelete"],
        },
        {
          model: Ent_calv,
          attributes: ["Tenca", "isDelete"],
        },
      ],
    });

    // Initialize result structure to store completion rates per month
    const result = {};

    // Initialize months array for categories
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Initialize result for each work unit (KhoiCV) and each month, per shift (Calv)
    months.forEach((month) => {
      result[month] = {};
    });

    // Iterate over checklists and accumulate data by KhoiCV, Calv, and month
    relatedChecklists.forEach((checklist) => {
      const khoiName = checklist.ent_khoicv.KhoiCV;
      const shiftName = checklist.ent_calv.Tenca;
      const checklistDate = new Date(checklist.Ngay);
      const checklistMonth = checklistDate.getMonth(); // Get month (0 = January)
      const day = checklistDate.getDate();

      // Ensure the structure exists for each KhoiCV, shift, and day
      if (!result[months[checklistMonth]][khoiName]) {
        result[months[checklistMonth]][khoiName] = {};
      }

      if (!result[months[checklistMonth]][khoiName][shiftName]) {
        result[months[checklistMonth]][khoiName][shiftName] = {};
      }

      if (!result[months[checklistMonth]][khoiName][shiftName][day]) {
        result[months[checklistMonth]][khoiName][shiftName][day] = {
          totalTongC: checklist.TongC,
          Tong: checklist.Tong,
        };
      }

      // Sum up TongC for each day
      // result[months[checklistMonth]][khoiName][shiftName][day].totalTongC +=
      //   checklist.TongC;
    });

    // Convert the result into the required format
    const formatSeriesData = (result) => {
      const khoiCVs = new Set();

      // Extract unique KhoiCVs
      months.forEach((month) => {
        const khoiCVMonth = result[month];
        Object.keys(khoiCVMonth).forEach((khoiCV) => {
          khoiCVs.add(khoiCV);
        });
      });

      const series = [];

      // Loop through each KhoiCV to create the series
      khoiCVs.forEach((khoiCV) => {
        const data = months.map((month) => {
          const khoiCVMonth = result[month][khoiCV] || {};
          const shiftData = Object.values(khoiCVMonth);

          let monthlyTotalPercentage = 0;
          let countDays = 0;

          shiftData.forEach((shift) => {
            Object.values(shift).forEach((dayData) => {
              const { totalTongC, Tong } = dayData;
              if (Tong > 0) {
                monthlyTotalPercentage += (totalTongC / Tong) * 100;
                countDays += 1;
              }
            });
          });

          return countDays > 0
            ? parseFloat((monthlyTotalPercentage / countDays).toFixed(2))
            : 0;
        });

        series.push({
          name: khoiCV,
          data: data,
        });
      });

      return series;
    };

    const formattedSeries = formatSeriesData(result);

    // Prepare response data
    const resultArray = {
      categories: months, // Replace projectNames with months
      series: [
        {
          type: year.toString(), // Add year as type
          data: formattedSeries,
        },
      ],
    };

    // Send response
    res.status(200).json({
      message:
        "Tỉ lệ hoàn thành checklist theo khối công việc (KhoiCV), ca làm việc (Calv), và tháng",
      data: resultArray,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.checklistYearByKhoiCVSuCo = async (req, res) => {
  try {
    const userData = req.user.data;
    const year = req.query.year || new Date().getFullYear(); // Lấy năm
    const khoi = req.query.khoi;
    const tangGiam = "desc"; // Thứ tự sắp xếp

    // Xây dựng điều kiện where cho truy vấn
    let whereClause = {
      isDelete: 0,
      ID_Duan: userData.ID_Duan, // Lấy theo ID dự án của userData
    };

    if (khoi !== "all") {
      whereClause.ID_KhoiCV = khoi;
    }

    if (year) {
      whereClause.Ngay = {
        [Op.gte]: `${year}-01-01`,
        [Op.lte]: `${year}-12-31`,
      };
    }

    const relatedChecklists = await Tb_checklistchitiet.findAll({
      attributes: [
        "ID_Checklistchitiet",
        "ID_ChecklistC",
        "ID_Checklist",
        "Ketqua",
        "Anh",
        "Ngay",
        "Gioht",
        "Ghichu",
        "isDelete",
      ],

      include: [
        {
          model: Tb_checklistc,
          as: "tb_checklistc",
          attributes: [
            "ID_KhoiCV",
            "Ngay",
            "TongC",
            "Tong",
            "Tinhtrang",
            "ID_Duan",
            "isDelete",
          ],
          include: [
            {
              model: Ent_khoicv,
              attributes: ["KhoiCV"], // Tên khối
            },
          ],
          where: whereClause,
        },
        {
          model: Ent_checklist,
          attributes: [
            "ID_Checklist",
            "ID_Hangmuc",
            "ID_Tang",
            "Sothutu",
            "Maso",
            "MaQrCode",
            "Checklist",
            "Giatridinhdanh",
            "isCheck",
            "Giatrinhan",
            "Tinhtrang",
          ],
          where: {
            Tinhtrang: 1,
          },
        },
      ],
    });

    // Tạo đối tượng để lưu số lượng sự cố theo khối công việc và tháng
    const khoiIncidentCount = {};

    // Xử lý dữ liệu để đếm số lượng sự cố cho từng khối theo tháng
    relatedChecklists.forEach((checklistC) => {
      const khoiName = checklistC.tb_checklistc.ent_khoicv.KhoiCV; // Lấy tên khối
      const checklistDate = new Date(checklistC.tb_checklistc.Ngay);
      const checklistMonth = checklistDate.getMonth(); // Lấy tháng (0 = January)

      if (!khoiIncidentCount[khoiName]) {
        khoiIncidentCount[khoiName] = Array(12).fill(0);
      }

      // Tăng số lượng sự cố cho khối này theo tháng
      khoiIncidentCount[khoiName][checklistMonth] += 1;
    });

    // Chuyển đối tượng thành mảng kết quả
    const formatSeriesData = (data) => {
      const khois = Object.keys(data);
      return khois.map((khoi) => ({
        name: khoi,
        data: data[khoi],
      }));
    };

    const formattedSeries = formatSeriesData(khoiIncidentCount);

    // Sắp xếp kết quả theo tangGiam
    const sortedSeries = formattedSeries.sort((a, b) => {
      const sumA = a.data.reduce((sum, value) => sum + value, 0);
      const sumB = b.data.reduce((sum, value) => sum + value, 0);
      return tangGiam === "asc" ? sumA - sumB : sumB - sumA;
    });

    const result = {
      categories: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
      series: [
        {
          type: String(year), // Gán type với giá trị năm
          data: sortedSeries,
        },
      ],
    };

    // Trả về kết quả
    res.status(200).json({
      message: "Số lượng sự cố theo khối công việc và tháng",
      data: result,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.tiLeHoanThanh = async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const month = req.query.month || new Date().getMonth() + 1;
    const khoi = req.query.khoi;
    const nhom = req.query.nhom;
    const tangGiam = req.query.tangGiam || "desc";
    const top = req.query.top || "5";

    let whereClause = {
      isDelete: 0,
      ID_Duan: {
        [Op.ne]: 1,
      },
      Tinhtrang: 1
    };

    const getLastDayOfMonth = (year, month) => {
      return new Date(year, month, 0).getDate(); // Get the last day of the given month
    };

    if (khoi !== "all") {
      whereClause.ID_KhoiCV = khoi;
    }

    if (nhom !== "all") {
      whereClause["$ent_duan.ID_Phanloai$"] = nhom; // Add condition for nhom
    }

    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");

    // Use this in place of the current date logic in the `whereClause`
    whereClause.Ngay = {
      [Op.gte]: `${yesterday} 00:00:00`,
      [Op.lte]: `${yesterday} 23:59:59`,
    };

    // if (year && month === "all") {
    //   whereClause.Ngay = {
    //     [Op.gte]: `${year}-01-01`,
    //     [Op.lte]: `${year}-12-31`,
    //   };
    // }

    // if (year && month !== "all") {
    //   const lastDay = getLastDayOfMonth(year, month); // Get the correct last day for the given month
    //   const formattedMonth = month < 10 ? `0${month}` : `${month}`; // Ensure the month is formatted as two digits
    //   whereClause.Ngay = {
    //     [Op.gte]: `${year}-${formattedMonth}-01`,
    //     [Op.lte]: `${year}-${formattedMonth}-${lastDay}`,
    //   };
    // }

    // Fetch related checklist data along with project and khối information
    const relatedChecklists = await Tb_checklistc.findAll({
      attributes: [
        "ID_Duan",
        "ID_KhoiCV",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "isDelete",
        "Tinhtrang"
      ],
      where: whereClause,
      include: [
        {
          model: Ent_duan,
          attributes: ["Duan", "ID_Nhom", "ID_Phanloai"],
        },
        {
          model: Ent_khoicv,
          attributes: ["KhoiCV"], // Get khối name
        },
        {
          model: Ent_calv,
          attributes: ["Tenca"], // Get shift name
        },
      ],
    });

    // Create a dictionary to group data by project, khối, and ca
    const result = {};

    relatedChecklists.forEach((checklistC) => {
      const projectId = checklistC.ID_Duan;
      const projectName = checklistC.ent_duan.Duan;
      const khoiName = checklistC.ent_khoicv.KhoiCV;
      const shiftName = checklistC.ent_calv.Tenca;

      if (!result[projectId]) {
        result[projectId] = {
          projectName,
          khois: {},
        };
      }

      if (!result[projectId].khois[khoiName]) {
        result[projectId].khois[khoiName] = {
          shifts: {},
        };
      }

      if (!result[projectId].khois[khoiName].shifts[shiftName]) {
        result[projectId].khois[khoiName].shifts[shiftName] = {
          totalTongC: 0,
          totalTong: checklistC.Tong,
          userCompletionRates: [],
        };
      }

      // Accumulate data for shifts
      result[projectId].khois[khoiName].shifts[shiftName].totalTongC +=
        checklistC.TongC;

      // Calculate user completion rate and add to the list
      const userCompletionRate = (checklistC.TongC / checklistC.Tong) * 100;
      result[projectId].khois[khoiName].shifts[
        shiftName
      ].userCompletionRates.push(userCompletionRate);
    });

    // Calculate completion rates for each khối and project
    Object.values(result).forEach((project) => {
      Object.values(project.khois).forEach((khoi) => {
        let totalKhoiCompletionRatio = 0;
        let totalShifts = 0;

        Object.values(khoi.shifts).forEach((shift) => {
          // Calculate shift completion ratio
          let shiftCompletionRatio = shift.userCompletionRates.reduce(
            (sum, rate) => sum + rate,
            0
          );
          if (shiftCompletionRatio > 100) {
            shiftCompletionRatio = 100; // Cap each shift at 100%
          }

          // Sum up completion ratios for each khối
          totalKhoiCompletionRatio += shiftCompletionRatio;
          totalShifts += 1;
        });

        // Calculate average completion ratio for khối
        khoi.completionRatio = totalKhoiCompletionRatio / totalShifts;
      });
    });

    // Prepare response data
    let projectNames = [];
    let percentageData = [];

    Object.values(result).forEach((project) => {
      projectNames.push(project.projectName);

      let totalCompletionRatio = 0;
      let totalKhois = 0;

      Object.values(project.khois).forEach((khoi) => {
        totalCompletionRatio += khoi.completionRatio;
        totalKhois += 1;
      });

      const avgCompletionRatio =
        totalKhois > 0 ? totalCompletionRatio / totalKhois : 0;
      percentageData.push(avgCompletionRatio.toFixed(2)); // Format to 2 decimal places
    });

    // Sort the percentageData based on 'tangGiam' query parameter
    // Tạo mảng các cặp [projectName, percentageData]
    const projectWithData = projectNames.map((name, index) => ({
      name: name,
      percentage: parseFloat(percentageData[index]), // Đảm bảo giá trị là số
    }));

    // Sắp xếp dựa trên percentageData
    if (tangGiam === "asc") {
      projectWithData.sort((a, b) => a.percentage - b.percentage); // Sắp xếp tăng dần
    } else if (tangGiam === "desc") {
      projectWithData.sort((a, b) => b.percentage - a.percentage); // Sắp xếp giảm dần
    }

    const topResultArray = projectWithData.slice(0, Number(top));

    // Sau khi sắp xếp, tách lại thành 2 mảng riêng
    projectNames = topResultArray.map((item) => item.name);
    percentageData = topResultArray.map((item) => item.percentage);

    const resultArray = {
      categories: projectNames,
      series: [
        {
          type: String(year),
          data: [
            {
              name: "Tỉ lệ",
              data: percentageData,
            },
          ],
        },
      ],
    };

    res.status(200).json({
      message: "Tỉ lệ hoàn thành của các dự án theo khối",
      data: resultArray,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.tiLeSuco = async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear(); // Lấy năm
    const month = req.query.month || new Date().getMonth() + 1; // Lấy tháng
    const khoi = req.query.khoi;
    const nhom = req.query.nhom;
    const tangGiam = req.query.tangGiam || "desc"; // Thứ tự tăng giảm
    const top = req.query.top || "5";

    // Xây dựng điều kiện where cho truy vấn
    let whereClause = {
      isDelete: 0,
      ID_Duan: {
        [Op.ne]: 1,
      },
      Tinhtrang: 1
    };

    // if (khoi !== "all") {
    //   whereClause.ID_KhoiCV = khoi;
    // }

    // if (nhom !== "all") {
    //   whereClause["$ent_duan.ID_Phanloai$"] = nhom;
    // }

    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");

    // Use this in place of the current date logic in the `whereClause`
    whereClause.Ngay = {
      [Op.gte]: `${yesterday} 00:00:00`,
      [Op.lte]: `${yesterday} 23:59:59`,
    };
    // Truy vấn cơ sở dữ liệu
    const relatedChecklists = await Tb_checklistc.findAll({
      attributes: [
        "ID_Duan",
        "ID_KhoiCV",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "Tinhtrang",
        "isDelete",
      ],
      where: whereClause,
      include: [
        {
          model: Ent_duan,
          attributes: ["Duan", "ID_Nhom", "ID_Phanloai"],
        },
        {
          model: Ent_khoicv,
          attributes: ["KhoiCV"], // Tên khối
        },
        {
          model: Ent_calv,
          attributes: ["Tenca"], // Tên ca
        },
        {
          model: Tb_checklistchitiet,
          as: "tb_checklistchitiets",
          attributes: [
            "ID_Checklistchitiet",
            "ID_ChecklistC",
            "ID_Checklist",
            "Ketqua",
            "Anh",
            "Ngay",
            "Gioht",
            "Ghichu",
            "isDelete",
          ],
          include: [
            {
              model: Ent_checklist,
              attributes: [
                "ID_Checklist",
                "ID_Hangmuc",
                "ID_Tang",
                "Sothutu",
                "Maso",
                "MaQrCode",
                "Checklist",
                "Giatridinhdanh",
                "isCheck",
                "Giatrinhan",
                "Tinhtrang",
              ],
              where: {
                Tinhtrang: 1,
              },
            },
          ],
        },
      ],
      raw: true,
    });

    // Tạo đối tượng để lưu số lượng sự cố theo dự án
    const projectIncidentCount = {};

    // Xử lý dữ liệu để đếm số lượng sự cố cho từng dự án
    relatedChecklists.forEach((checklistC) => {
      const projectName = checklistC["ent_duan.Duan"]; // Lấy tên dự án

      // Kiểm tra nếu có dữ liệu trong tb_checklistchitiets và Tinhtrang của ent_checklist = 1
      if (
        checklistC["tb_checklistchitiets.ID_Checklistchitiet"] &&
        checklistC["tb_checklistchitiets.ent_checklist.Tinhtrang"] === 1
      ) {
        // Khởi tạo nếu dự án chưa có trong đối tượng
        if (!projectIncidentCount[projectName]) {
          projectIncidentCount[projectName] = 0;
        }

        // Tăng số lượng sự cố cho dự án này
        projectIncidentCount[projectName] += 1;
      }
    });

    // Chuyển đối tượng thành mảng kết quả
    const resultArray = Object.keys(projectIncidentCount).map(
      (projectName) => ({
        project: projectName,
        incidentCount: projectIncidentCount[projectName],
      })
    );

    // Sắp xếp kết quả theo tangGiam
    if (tangGiam === "asc") {
      resultArray.sort((a, b) => a.incidentCount - b.incidentCount); // Sắp xếp tăng dần
    } else if (tangGiam === "desc") {
      resultArray.sort((a, b) => b.incidentCount - a.incidentCount); // Sắp xếp giảm dần
    }

    const topResultArray = resultArray.slice(0, Number(top));

    const projectNames = topResultArray.map((item) => item.project);
    const percentageData = topResultArray.map((item) => item.incidentCount);

    const result = {
      categories: projectNames,
      series: [
        {
          type: String(year),
          data: [
            {
              name: "Số lượng",
              data: percentageData,
            },
          ],
        },
      ],
    };

    // Trả về kết quả
    res.status(200).json({
      message: "Số lượng sự cố theo dự án",
      data: result,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.suCoChiTiet = async (req, res) => {
  const name = req.query.name;
  const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");

  let whereClause = {
    isDelete: 0,
    ID_Duan: {
      [Op.ne]: 1,
    },
    Tinhtrang: 1
  };

  whereClause.Ngay = {
    [Op.gte]: `${yesterday} 00:00:00`,
    [Op.lte]: `${yesterday} 23:59:59`,
  };

  const relatedChecklists = await Tb_checklistc.findAll({
    attributes: [
      "ID_Duan",
      "ID_KhoiCV",
      "ID_Calv",
      "Ngay",
      "TongC",
      "Tong",
      "Tinhtrang",
      "isDelete",
    ],
    where: whereClause,
    include: [
      {
        model: Ent_duan,
        attributes: ["Duan", "ID_Nhom", "ID_Phanloai"],
      },
      {
        model: Ent_khoicv,
        attributes: ["KhoiCV"],
      },
      {
        model: Ent_calv,
        attributes: ["Tenca"],
      },
      {
        model: Tb_checklistchitiet,
        as: "tb_checklistchitiets",
        attributes: [
          "ID_Checklistchitiet",
          "ID_ChecklistC",
          "ID_Checklist",
          "Ketqua",
          "Anh",
          "Ngay",
          "Gioht",
          "Ghichu",
          "isDelete",
        ],
        include: [
          {
            model: Ent_checklist,
            attributes: [
              "ID_Checklist",
              "ID_Hangmuc",
              "ID_Tang",
              "Sothutu",
              "Maso",
              "MaQrCode",
              "Checklist",
              "Giatridinhdanh",
              "isCheck",
              "Giatrinhan",
              "Tinhtrang",
              "isDelete",
            ],
            where: {
              Tinhtrang: 1,
              isDelete: 0,
            },
            include: [
              {
                model: Ent_hangmuc,
                attributes: ["Hangmuc", "isDelete"],
                isDelete: 0,
              },
            ],
          },
        ],
      },
    ],
  });

  // Gom tất cả các tb_checklistchitiets từ tất cả các dự án
  const allChecklistDetails = relatedChecklists.reduce((acc, checklist) => {
    // Kiểm tra nếu có tb_checklistchitiets và trùng tên dự án (name)
    if (
      checklist.tb_checklistchitiets &&
      checklist.tb_checklistchitiets.length > 0 &&
      checklist.ent_duan.Duan.toLowerCase() === name.toLowerCase() // So sánh không phân biệt hoa thường
    ) {
      // Gom mảng tb_checklistchitiets
      acc.push(...checklist.tb_checklistchitiets);
    }
    return acc;
  }, []);

  // Trả về dữ liệu chỉ bao gồm mảng tb_checklistchitiets
  return res.status(200).json({
    message: "Danh sách chi tiết sự cố",
    data: allChecklistDetails,
  });
};

exports.soSanhSuCo = async (req, res) => {
  try {
    const weekAgo = moment().subtract(1, "week");
    const twoWeeksAgo = moment().subtract(2, "week");

    // Đặt ngày bắt đầu và kết thúc cho hai tuần trước
    const startOfLastWeek = weekAgo
      .clone()
      .startOf("isoWeek")
      .format("YYYY-MM-DD HH:mm:ss");
    const endOfLastWeek = weekAgo
      .clone()
      .endOf("isoWeek")
      .format("YYYY-MM-DD HH:mm:ss");

    const startOfTwoWeeksAgo = twoWeeksAgo
      .clone()
      .startOf("isoWeek")
      .format("YYYY-MM-DD HH:mm:ss");
    const endOfTwoWeeksAgo = twoWeeksAgo
      .clone()
      .endOf("isoWeek")
      .format("YYYY-MM-DD HH:mm:ss");

    // Xây dựng điều kiện where cho truy vấn
    let whereClause = {
      isDelete: 0,
    };

    // if (khoi !== "all") {
    //   whereClause.ID_KhoiCV = khoi;
    // }

    // if (nhom !== "all") {
    //   whereClause["$ent_duan.ID_Nhom$"] = nhom;
    // }

    // Truy vấn số lượng sự cố cho tuần trước
    const lastWeekIncidents = await Tb_checklistc.findAll({
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("ID_Duan")), "lastWeekTotalCount"],
      ],
      where: {
        ...whereClause,
        Ngay: {
          [Op.gte]: startOfLastWeek,
          [Op.lte]: endOfLastWeek,
        },
        ID_Duan: {
          [Op.ne]: 1,
        },
        Tinhtrang: 1
      },
      raw: true,
    });

    // Truy vấn số lượng sự cố cho tuần trước nữa
    const twoWeeksAgoIncidents = await Tb_checklistc.findAll({
      attributes: [
        [
          sequelize.fn("COUNT", sequelize.col("ID_Duan")),
          "twoWeeksAgoTotalCount",
        ],
      ],
      where: {
        ...whereClause,
        Ngay: {
          [Op.gte]: startOfTwoWeeksAgo,
          [Op.lte]: endOfTwoWeeksAgo,
        },
        Tinhtrang: 1
      },
      raw: true,
    });

    // Lấy tổng số lượng sự cố từ kết quả truy vấn
    const lastWeekCount =
      parseInt(lastWeekIncidents[0]?.lastWeekTotalCount, 10) || 0;
    const twoWeeksAgoCount =
      parseInt(twoWeeksAgoIncidents[0]?.twoWeeksAgoTotalCount, 10) || 0;

    // Tính phần trăm thay đổi
    let percentageChange = 0;
    if (twoWeeksAgoCount > 0) {
      // Tránh chia cho 0
      percentageChange =
        ((lastWeekCount - twoWeeksAgoCount) / twoWeeksAgoCount) * 100;
    } else if (lastWeekCount > 0) {
      percentageChange = 100; // Nếu tuần trước có sự cố mà tuần này không có
    }

    // Trả về kết quả
    res.status(200).json({
      message: "So sánh số lượng sự cố giữa hai tuần",
      data: {
        lastWeekTotalCount: lastWeekCount,
        twoWeeksAgoTotalCount: twoWeeksAgoCount,
        percentageChange: percentageChange.toFixed(2), // Làm tròn đến 2 chữ số thập phân
      },
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

const calculateCompletionPercentagePerProject = (checklists) => {
  const projectCompletionRates = {};

  // Group checklists by project and calculate individual project completion rates
  checklists.forEach((checklist) => {
    const projectId = checklist.ID_Duan;

    if (!projectCompletionRates[projectId]) {
      projectCompletionRates[projectId] = {
        totalTongC: 0,
        totalTong: 0,
      };
    }

    // Sum up TongC and Tong for each project
    projectCompletionRates[projectId].totalTongC += checklist.TongC;
    projectCompletionRates[projectId].totalTong += checklist.Tong;
  });

  let totalCompletionPercentage = 0;
  const numberOfProjects = Object.keys(projectCompletionRates).length;

  // Calculate percentage for each project and sum them
  Object.values(projectCompletionRates).forEach((project) => {
    const projectPercentage =
      project.totalTong > 0
        ? (project.totalTongC / project.totalTong) * 100
        : 0;
    totalCompletionPercentage += projectPercentage;
  });

  // Return average completion percentage for all projects
  return numberOfProjects > 0
    ? totalCompletionPercentage / numberOfProjects
    : 0;
};

exports.reportPercentWeek = async (req, res) => {
  try {
    const khoi = req.query.khoi;
    const nhom = req.query.nhom;

    let lastWhereClause = {
      isDelete: 0,
      ID_Duan: {
        [Op.ne]: 1,
      },
      Tinhtrang: 1
    };

    let prevWhereClause = {
      isDelete: 0,
      ID_Duan: {
        [Op.ne]: 1,
      },
      Tinhtrang: 1
    };

    // if (khoi !== "all") {
    //   lastWhereClause.ID_KhoiCV = khoi;
    //   prevWhereClause.ID_KhoiCV = khoi;
    // }

    // if (nhom !== "all") {
    //   lastWhereClause["$ent_duan.ID_Nhom$"] = nhom;
    //   prevWhereClause["$ent_duan.ID_Nhom$"] = nhom;
    // }

    // Get date ranges for last week and the previous week
    const lastWeekStart = moment()
      .subtract(7, "days")
      .startOf("day")
      .format("YYYY-MM-DD");
    const lastWeekEnd = moment()
      .subtract(1, "days")
      .endOf("day")
      .format("YYYY-MM-DD");
    const previousWeekStart = moment()
      .subtract(14, "days")
      .startOf("day")
      .format("YYYY-MM-DD");
    const previousWeekEnd = moment()
      .subtract(8, "days")
      .endOf("day")
      .format("YYYY-MM-DD");

    lastWhereClause.Ngay = {
      [Op.gte]: `${lastWeekStart} 00:00:00`,
      [Op.lte]: `${lastWeekEnd} 23:59:59`,
    };

    prevWhereClause.Ngay = {
      [Op.gte]: `${previousWeekStart} 00:00:00`,
      [Op.lte]: `${previousWeekEnd} 23:59:59`,
    };

    // Fetch data for last week
    const lastWeekData = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "ID_KhoiCV",
        "isDelete",
        "Tinhtrang"
      ],
      where: lastWhereClause,
      include: [
        { model: Ent_duan, attributes: ["Duan", "ID_Nhom"] },
        { model: Ent_khoicv, attributes: ["KhoiCV"] },
        { model: Ent_calv, attributes: ["Tenca"] },
      ],
    });

    // Fetch data for previous week
    const previousWeekData = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "ID_KhoiCV",
        "isDelete",
        "Tinhtrang"
      ],
      where: prevWhereClause,
      include: [
        { model: Ent_duan, attributes: ["Duan", "ID_Nhom", "ID_Duan"] },
        { model: Ent_khoicv, attributes: ["KhoiCV"] },
        { model: Ent_calv, attributes: ["Tenca"] },
      ],
    });

    // Calculate total completion percentage for last week and previous week
    const lastWeekPercentage =
      calculateCompletionPercentagePerProject(lastWeekData);
    const previousWeekPercentage =
      calculateCompletionPercentagePerProject(previousWeekData);

    // Calculate the difference between the two weeks
    const percentageDifference = lastWeekPercentage - previousWeekPercentage;

    res.status(200).json({
      message: "Completion percentages comparison between two weeks",
      data: {
        lastWeekPercentage: lastWeekPercentage.toFixed(2),
        previousWeekPercentage: previousWeekPercentage.toFixed(2),
        percentageDifference: percentageDifference.toFixed(2),
      },
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Error! Please try again later." });
  }
};

exports.reportPercentYesterday = async (req, res) => {
  try {
    // Lấy ngày hôm qua
    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");

    // Lấy tất cả dữ liệu checklistC cho ngày hôm qua
    const dataChecklistCs = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "ID_KhoiCV",
        "isDelete",
        "Tinhtrang"
      ],
      where: {
        Ngay: yesterday,
        isDelete: 0,
        ID_Duan: {
          [Op.ne]: 1,
        },
        Tinhtrang: 1
      },
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
          model: Ent_calv,
          attributes: ["Tenca"],
        },
      ],
    });

    // Tạo một dictionary để nhóm dữ liệu theo dự án và khối
    const result = {};

    dataChecklistCs.forEach((checklistC) => {
      const projectId = checklistC.ID_Duan;
      const projectName = checklistC.ent_duan.Duan;
      const khoiName = checklistC.ent_khoicv.KhoiCV;
      const shiftName = checklistC.ent_calv.Tenca;

      // Khởi tạo dữ liệu dự án nếu chưa tồn tại
      if (!result[projectId]) {
        result[projectId] = {
          projectId,
          projectName,
          createdKhois: {},
        };
      }

      // Khởi tạo dữ liệu cho khối nếu chưa tồn tại
      if (!result[projectId].createdKhois[khoiName]) {
        result[projectId].createdKhois[khoiName] = {
          shifts: {},
        };
      }

      // Khởi tạo dữ liệu cho ca nếu chưa tồn tại
      if (!result[projectId].createdKhois[khoiName].shifts[shiftName]) {
        result[projectId].createdKhois[khoiName].shifts[shiftName] = {
          totalTongC: 0,
          totalTong: 0,
          userCompletionRates: [],
        };
      }

      // Cộng dồn TongC và Tong cho ca
      result[projectId].createdKhois[khoiName].shifts[shiftName].totalTongC +=
        checklistC.TongC;
      result[projectId].createdKhois[khoiName].shifts[shiftName].totalTong =
        checklistC.Tong;

      // Lưu tỷ lệ hoàn thành của từng người
      if (checklistC.Tong > 0) {
        // Check to prevent division by zero
        const userCompletionRate = (checklistC.TongC / checklistC.Tong) * 100;
        result[projectId].createdKhois[khoiName].shifts[
          shiftName
        ].userCompletionRates.push(userCompletionRate);
      }
    });

    // Tính toán phần trăm hoàn thành riêng cho từng ca và tổng khối
    Object.values(result).forEach((project) => {
      Object.values(project.createdKhois).forEach((khoi) => {
        let totalKhoiCompletionRatio = 0;
        let totalShifts = 0;

        Object.values(khoi.shifts).forEach((shift) => {
          let shiftCompletionRatio = shift.userCompletionRates.reduce(
            (sum, rate) => sum + rate,
            0
          );
          shiftCompletionRatio = Math.min(shiftCompletionRatio, 100); // Giới hạn phần trăm hoàn thành tối đa là 100%

          totalKhoiCompletionRatio += shiftCompletionRatio;
          totalShifts += 1;
        });

        // Tính phần trăm hoàn thành trung bình cho khối
        const avgKhoiCompletionRatio = totalKhoiCompletionRatio / totalShifts;
        khoi.completionRatio = Number.isInteger(avgKhoiCompletionRatio)
          ? avgKhoiCompletionRatio
          : avgKhoiCompletionRatio.toFixed(2);
      });
    });

    // Chuyển result object thành mảng
    const resultArray = Object.values(result);

    // Tạo đối tượng để lưu tổng completionRatio và đếm số dự án có khối tương ứng
    const avgKhoiCompletion = {
      "Khối kỹ thuật": { totalCompletion: 0, projectCount: 0 },
      "Khối làm sạch": { totalCompletion: 0, projectCount: 0 },
      "Khối dịch vụ": { totalCompletion: 0, projectCount: 0 },
      "Khối bảo vệ": { totalCompletion: 0, projectCount: 0 },
      "Khối F&B": { totalCompletion: 0, projectCount: 0 },
    };

    // Tính toán tổng completionRatio cho từng khối từ tất cả các dự án
    Object.values(result).forEach((project) => {
      Object.keys(avgKhoiCompletion).forEach((khoiName) => {
        const khoi = project.createdKhois[khoiName];
        if (khoi && khoi.completionRatio) {
          avgKhoiCompletion[khoiName].totalCompletion += parseFloat(
            khoi.completionRatio
          );
          avgKhoiCompletion[khoiName].projectCount += 1;
        }
      });
    });

    // Tính trung bình completionRatio cho từng khối
    const avgCompletionRatios = {};
    Object.keys(avgKhoiCompletion).forEach((khoiName) => {
      const { totalCompletion, projectCount } = avgKhoiCompletion[khoiName];

      const averageCompletion =
        projectCount > 0 ? totalCompletion / projectCount : null;

      // If the average completion is not null and is a whole number, don't use .toFixed(2)
      avgCompletionRatios[khoiName] =
        averageCompletion !== null
          ? Number.isInteger(averageCompletion)
            ? averageCompletion // If it's an integer, no decimals
            : averageCompletion.toFixed(2) // Otherwise, keep 2 decimals
          : null;
    });
    // Bạn có thể trả về kết quả này trong response của API
    res.status(200).json({
      message:
        "Trạng thái checklist của các dự án theo từng khối và ca làm việc",
      data: resultArray,
      avgCompletionRatios, // Thêm tỷ lệ trung bình vào kết quả trả về
    });
  } catch (err) {
    console.error("Error fetching checklist data: ", err); // Log the error for debugging
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.checklistPercent = async (req, res) => {
  try {
    const userData = req.user.data;

    if (!userData) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    }

    let whereClause = {
      isDelete: 0,
      ID_Duan: userData.ID_Duan,
      Tinhtrang: 1
    };

    const results = await Tb_checklistc.findAll({
      include: [
        {
          model: Ent_khoicv,
          attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
        },
      ],
      attributes: [
        [sequelize.col("ent_khoicv.KhoiCV"), "label"],
        [sequelize.col("tb_checklistc.tongC"), "totalAmount"],
        [
          sequelize.literal("tb_checklistc.tongC / tb_checklistc.tong * 100"),
          "value",
        ],
      ],
      where: whereClause,
    });

    // Chuyển đổi dữ liệu kết quả sang định dạng mong muốn
    const data = results.map((result) => {
      const { label, totalAmount, value } = result.get();
      return {
        label,
        totalAmount,
        value,
      };
    });
    processData(data).then((finalData) => {
      res.status(200).json({
        message: "Dữ liệu!",
        data: finalData,
      });
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.getChecklistsErrorFromYesterday = async (req, res) => {
  try {
    // const userData = req.user.data;
    // Get the date for yesterday and today
    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");
    const now = moment().format("YYYY-MM-DD");

    // Fetch all checklistC data for yesterday
    const dataChecklistCs = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "Tong",
        "TongC",
        "Ngay",
        "ID_KhoiCV",
        "ID_Calv",
        "ID_User",
      ],
      include: [
        {
          model: Ent_khoicv,
          attributes: ["KhoiCV"],
        },
        {
          model: Ent_calv,
          attributes: ["Tenca", "Giobatdau", "Gioketthuc"],
        },
        {
          model: Ent_duan,
          attributes: ["Duan", "ID_Nhom"],
          include: [
            {
              model: Ent_nhom,
              attributes: ["Tennhom"],
            },
          ],
        },
      ],
      where: {
        Ngay: {
          [Op.between]: [yesterday, now],
        },
        ID_Duan: {
          [Op.ne]: 1,
        },
        // ID_Duan: userData.ID_Duan
      },
    });

    // Fetch checklist detail items for the related checklistC
    const checklistDetailItems = await Tb_checklistchitiet.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Checklist",
        "Ketqua",
        "Anh",
        "Ghichu",
        "Gioht",
      ],
      where: {
        ID_ChecklistC: {
          [Op.in]: dataChecklistCs.map(
            (checklistC) => checklistC.ID_ChecklistC
          ),
        },
        Anh: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
        Ghichu: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
      },
      include: [
        {
          model: Tb_checklistc,
          as: "tb_checklistc",
          attributes: [
            "ID_ChecklistC",
            "ID_Duan",
            "ID_KhoiCV",
            "ID_Calv",
            "ID_User",
            "Ngay",
            "Tong",
            "TongC",
            "Giobd",
            "Giochupanh1",
            "Anh1",
            "Giochupanh2",
            "Anh2",
            "Giochupanh3",
            "Anh3",
            "Giochupanh4",
            "Anh4",
            "Giokt",
            "Ghichu",
            "Tinhtrang",
            "isDelete",
          ],
          include: [
            {
              model: Ent_khoicv,
              attributes: ["KhoiCV"],
            },
            {
              model: Ent_duan,
              attributes: ["Duan"],
            },
            {
              model: Ent_calv,
              attributes: ["Tenca", "Giobatdau", "Gioketthuc"],
            },
          ],
        },
        {
          model: Ent_checklist,
          attributes: [
            "ID_Checklist",
            "ID_Khuvuc",
            "ID_Hangmuc",
            "ID_Tang",
            "Sothutu",
            "Maso",
            "MaQrCode",
            "Checklist",
            "Giatridinhdanh",
            "isCheck",
            "Giatrinhan",
          ],
          include: [
            {
              model: Ent_khuvuc,
              attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],
              include: [
                {
                  model: Ent_toanha,
                  attributes: ["Toanha", "ID_Duan"],
                  include: [
                    {
                      model: Ent_duan,
                      attributes: ["Duan", "ID_Nhom"],
                      include: [
                        {
                          model: Ent_nhom,
                          attributes: ["Tennhom"],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              model: Ent_hangmuc,
              as: "ent_hangmuc",
              attributes: [
                "Hangmuc",
                "Tieuchuankt",
                "ID_Khuvuc",
                "MaQrCode",
                "FileTieuChuan",
              ],
            },
            {
              model: Ent_tang,
              attributes: ["Tentang"],
            },
            {
              model: Ent_user,
              attributes: ["UserName", "Hoten"],
            },
          ],
        },
      ],
    });

    // Populate error details
    const errorDetails = checklistDetailItems.map((item) => ({
      checklistId: item.ID_Checklist,
      checklistName: item.ent_checklist.Checklist,
      Anh: item.Anh,
      image: `https://lh3.googleusercontent.com/d/${item.Anh}=s1000?authuser=0`,
      note: item.Ghichu,
      gioht: item.Gioht,
      Ngay: item?.tb_checklistc?.Ngay,
      calv: item?.tb_checklistc?.ent_calv?.Tenca,
      Giamsat: item?.tb_checklistc?.ent_user?.Hoten,
      khoilv: item?.tb_checklistc?.ent_khoicv?.KhoiCV,
      duan: item?.tb_checklistc?.ent_duan?.Duan,
    }));

    res.status(200).json({
      message: "Danh sách checklist lỗi một tuần",
      data: errorDetails,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.getChecklistsErrorFromWeekbyDuan = async (req, res) => {
  try {
    const userData = req.user.data;

    // Get the date for yesterday
    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");
    const now = moment().format("YYYY-MM-DD");

    let whereClause = {
      Ngay: {
        [Op.between]: [yesterday, now],
      },
      isDelete: 0,
    };
    if (userData?.ent_chucvu?.Role !== 10 || userData?.ent_chucvu?.Role !== 0) {
      whereClause.ID_Duan = userData.ID_Duan;
    } else {
    }

    // Fetch all checklistC data for yesterday, excluding projects 10 and 17
    const dataChecklistCs = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "Tong",
        "TongC",
        "Ngay",
        "ID_KhoiCV",
        "ID_Calv",
        "ID_User",
      ],
      include: [
        {
          model: Ent_khoicv,
          attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
        },
        {
          model: Ent_user,
          attributes: ["ID_User", "Hoten", "ID_Chucvu"],
        },
        {
          model: Ent_calv,
          attributes: ["Tenca", "Giobatdau", "Gioketthuc"],
        },
        {
          model: Ent_duan,
          attributes: ["Duan", "ID_Nhom"],
          include: [
            {
              model: Ent_nhom,
              attributes: ["Tennhom"],
            },
          ],
        },
      ],
      where: whereClause,
    });

    // Fetch checklist detail items for the related checklistC
    const checklistDetailItems = await Tb_checklistchitiet.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Checklist",
        "Ketqua",
        "Anh",
        "Ghichu",
        "Gioht",
      ],
      where: {
        ID_ChecklistC: {
          [Op.in]: dataChecklistCs.map(
            (checklistC) => checklistC.ID_ChecklistC
          ),
        },
        Anh: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
        Ghichu: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
      },
      include: [
        {
          model: Tb_checklistc,
          as: "tb_checklistc",
          attributes: [
            "ID_ChecklistC",
            "ID_Hangmucs",
            "ID_Duan",
            "ID_KhoiCV",
            "ID_Calv",
            "ID_User",
            "Ngay",
            "Tong",
            "TongC",
            "Giobd",
            "Giochupanh1",
            "Anh1",
            "Giochupanh2",
            "Anh2",
            "Giochupanh3",
            "Anh3",
            "Giochupanh4",
            "Anh4",
            "Giokt",
            "Ghichu",
            "Tinhtrang",
            "isDelete",
          ],
          include: [
            {
              model: Ent_khoicv,
              attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
            },
            {
              model: Ent_user,
              attributes: ["ID_User", "Hoten", "ID_Chucvu"],
            },
            {
              model: Ent_calv,
              attributes: ["Tenca", "Giobatdau", "Gioketthuc"],
            },
          ],
          where: {
            isDelete: 0,
          },
        },
        {
          model: Ent_checklist,
          attributes: [
            "ID_Checklist",
            "ID_Khuvuc",
            "ID_Hangmuc",
            "ID_Tang",
            "Sothutu",
            "Maso",
            "MaQrCode",
            "Checklist",
            "Giatridinhdanh",
            "isCheck",
            "Giatrinhan",
          ],
          include: [
            {
              model: Ent_khuvuc,
              attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],

              include: [
                {
                  model: Ent_toanha,
                  attributes: ["Toanha", "ID_Duan"],

                  include: [
                    {
                      model: Ent_duan,
                      attributes: ["Duan", "ID_Nhom"],
                      include: [
                        {
                          model: Ent_nhom,
                          attributes: ["Tennhom"],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              model: Ent_hangmuc,
              as: "ent_hangmuc",
              attributes: [
                "Hangmuc",
                "Tieuchuankt",
                "ID_Khuvuc",
                "MaQrCode",
                "FileTieuChuan",
              ],
            },
            {
              model: Ent_tang,
              attributes: ["Tentang"],
            },
            {
              model: Ent_user,
              attributes: [
                "UserName",
                "Email",
                "Hoten",
                "Ngaysinh",
                "Gioitinh",
                "Sodienthoai",
              ],
            },
          ],
        },
      ],
    });

    // Create a dictionary to aggregate data by project
    const result = {};

    dataChecklistCs.forEach((checklistC) => {
      const projectId = checklistC.ID_Duan;
      const projectName = checklistC.ent_duan.Duan;

      // Initialize project data if it doesn't exist
      if (!result[projectId]) {
        result[projectId] = {
          projectId,
          projectName,
          errorCount: 0,
          errorDetails: [],
        };
      }
    });

    // Populate error details and count errors
    checklistDetailItems.forEach((item) => {
      const projectId = dataChecklistCs.find(
        (checklistC) => checklistC.ID_ChecklistC === item.ID_ChecklistC
      ).ID_Duan;

      result[projectId].errorDetails.push({
        checklistId: item.ID_Checklist,
        checklistName: item.ent_checklist.Checklist,
        Anh: item.Anh,
        image: `https://lh3.googleusercontent.com/d/${item.Anh}=s1000?authuser=0`,
        note: item.Ghichu,
        gioht: item.Gioht,
        Ngay: item.tb_checklistc.Ngay,
        calv: item.tb_checklistc.ent_calv?.Tenca,
        Giamsat: item.tb_checklistc.ent_user.Hoten,
        khoilv: item.tb_checklistc.ent_khoicv?.KhoiCV,
      });

      result[projectId].errorCount += 1;
    });

    // Convert result object to array
    const resultArray = Object.values(result);

    res.status(200).json({
      message: "Danh sách checklist lỗi một tuần",
      data: resultArray,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.getChecklistsError = async (req, res) => {
  try {
    const userData = req.user.data;
    const orConditions = [];
    orConditions.push({
      "$ent_hangmuc.ent_khuvuc.ent_toanha.ID_Duan$": userData?.ID_Duan,
    });

    // Fetch all checklistC data for yesterday, excluding projects 10 and 17
    const dataChecklistCs = await Ent_checklist.findAll({
      attributes: [
        "ID_Checklist",
        "ID_Hangmuc",
        "ID_Tang",
        "Sothutu",
        "Maso",
        "MaQrCode",
        "Tinhtrang",
        "Checklist",
        "Giatridinhdanh",
        "isCheck",
        "Giatrinhan",
        "isDelete",
      ],
      include: [
        {
          model: Ent_hangmuc,
          as: "ent_hangmuc",
          attributes: [
            "Hangmuc",
            "Tieuchuankt",
            "ID_Khuvuc",
            "MaQrCode",
            "ID_Khuvuc",
            "FileTieuChuan",
          ],
          include: [
            {
              model: Ent_khuvuc,
              attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],

              include: [
                {
                  model: Ent_toanha,
                  attributes: ["Toanha", "ID_Duan"],
                  include: [
                    {
                      model: Ent_duan,
                      attributes: ["Duan", "ID_Nhom", "ID_Duan"],
                      include: [
                        {
                          model: Ent_nhom,
                          attributes: ["Tennhom"],
                        },
                      ],
                      where: {
                        ID_Duan: userData.ID_Duan,
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: Ent_khuvuc,
          attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],

          include: [
            {
              model: Ent_toanha,
              attributes: ["Toanha", "ID_Duan"],
              include: [
                {
                  model: Ent_duan,
                  attributes: ["Duan", "ID_Nhom", "ID_Duan"],
                  include: [
                    {
                      model: Ent_nhom,
                      attributes: ["Tennhom"],
                    },
                  ],
                  where: {
                    ID_Duan: userData.ID_Duan,
                  },
                },
              ],
            },
          ],
        },
        {
          model: Ent_tang,
          attributes: ["Tentang"],
        },
        {
          model: Ent_user,
          attributes: [
            "UserName",
            "Email",
            "Hoten",
            "Ngaysinh",
            "Gioitinh",
            "Sodienthoai",
          ],
        },
      ],
      where: {
        Tinhtrang: 1,
        isDelete: 0,
        [Op.and]: [orConditions],
      },
    });

    // Convert result object to array
    const resultArray = Object.values(dataChecklistCs);

    res.status(200).json({
      message: "Danh sách checklist lỗi trong dự án",
      count: dataChecklistCs.length,
      data: resultArray,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.getProjectsChecklistStatus = async (req, res) => {
  try {
    // Lấy ngày hôm qua
    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");
    const now = moment().subtract(1, "days").format("YYYY-MM-DD");

    // Lấy tất cả dữ liệu checklistC cho ngày hôm qua
    const dataChecklistCs = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "ID_KhoiCV",
        "isDelete",
      ],
      where: {
        Ngay: yesterday,
        isDelete: 0,
        ID_Duan: {
          [Op.ne]: 1,
        },
      },
      include: [
        {
          model: Ent_duan,
          attributes: ["Duan"],
        },
        {
          model: Ent_khoicv, // Thêm bảng Ent_khoicv để lấy tên khối
          attributes: ["KhoiCV"],
        },
        {
          model: Ent_calv,
          attributes: ["Tenca"], // Lấy tên ca
        },
      ],
    });

    // Tạo một dictionary để nhóm dữ liệu theo dự án và khối
    const result = {};

    dataChecklistCs.forEach((checklistC) => {
      const projectId = checklistC.ID_Duan;
      const projectName = checklistC.ent_duan.Duan;
      const khoiName = checklistC.ent_khoicv.KhoiCV;
      const shiftName = checklistC.ent_calv.Tenca;

      // Khởi tạo dữ liệu dự án nếu chưa tồn tại
      if (!result[projectId]) {
        result[projectId] = {
          projectId,
          projectName,
          createdKhois: {},
        };
      }

      // Khởi tạo dữ liệu cho khối nếu chưa tồn tại
      if (!result[projectId].createdKhois[khoiName]) {
        result[projectId].createdKhois[khoiName] = {
          shifts: {},
        };
      }

      // Khởi tạo dữ liệu cho ca nếu chưa tồn tại
      if (!result[projectId].createdKhois[khoiName].shifts[shiftName]) {
        result[projectId].createdKhois[khoiName].shifts[shiftName] = {
          totalTongC: 0,
          totalTong: 0,
          userCompletionRates: [], // Lưu danh sách tỷ lệ hoàn thành của từng người
        };
      }

      // Cộng dồn TongC và Tong cho ca
      result[projectId].createdKhois[khoiName].shifts[shiftName].totalTongC +=
        checklistC.TongC;
      result[projectId].createdKhois[khoiName].shifts[shiftName].totalTong +=
        checklistC.Tong;

      // Lưu tỷ lệ hoàn thành của từng người
      let userCompletionRate = 0; // Mặc định là 0 nếu không có giá trị hợp lệ
      if (checklistC.Tong !== 0 && checklistC.Tong != null && checklistC.TongC != null) {
        userCompletionRate = (checklistC.TongC / checklistC.Tong) * 100;
      }
      // Đảm bảo tỷ lệ hoàn thành không vượt quá 100%
      userCompletionRate = userCompletionRate > 100 ? 100 : userCompletionRate;

      result[projectId].createdKhois[khoiName].shifts[shiftName].userCompletionRates.push(userCompletionRate);
    });

    // Tính toán phần trăm hoàn thành riêng cho từng ca và tổng khối
    Object.values(result).forEach((project) => {
      Object.values(project.createdKhois).forEach((khoi) => {
        let totalKhoiCompletionRatio = 0;
        let totalShifts = 0;

        Object.values(khoi.shifts).forEach((shift) => {
          // Tính phần trăm hoàn thành cho ca dựa trên tỷ lệ của từng người trong ca
          let shiftCompletionRatio = shift.userCompletionRates.reduce((sum, rate) => sum + (rate || 0), 0);
          if (shiftCompletionRatio > 100) {
            shiftCompletionRatio = 100; // Giới hạn phần trăm hoàn thành tối đa là 100% cho từng ca
          }

          // Tính tổng tỷ lệ hoàn thành của các ca
          totalKhoiCompletionRatio += shiftCompletionRatio;
          totalShifts += 1; // Tăng số lượng ca
        });

        // Tính phần trăm hoàn thành trung bình cho khối
        const avgKhoiCompletionRatio = totalKhoiCompletionRatio / totalShifts;

        khoi.completionRatio = Number.isInteger(avgKhoiCompletionRatio)
          ? avgKhoiCompletionRatio // No decimal places, return as is
          : avgKhoiCompletionRatio.toFixed(2); // Otherwise, apply toFixed(2)
      });
    });

    // Chuyển result object thành mảng
    const resultArray = Object.values(result);

    res.status(200).json({
      message:
        "Trạng thái checklist của các dự án theo từng khối và ca làm việc",
      data: resultArray,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.getProjectChecklistDays = async (req, res) => {
  try {
    // Lấy ngày bắt đầu từ 7 ngày trước
    const startDate = moment().subtract(7, "days").format("YYYY-MM-DD");
    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");

    // Lấy ID_Duan từ req.params hoặc req.query
    const { ID_Duan } = req.user.data; // Ensure project ID is passed in the request

    // Kiểm tra nếu không có ID_Duan được cung cấp
    if (!ID_Duan) {
      return res.status(400).json({ message: "ID_Duan is required" });
    }

    // Lấy tất cả dữ liệu checklistC cho dự án duy nhất trong vòng 7 ngày
    const dataChecklistCs = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "ID_KhoiCV",
        "isDelete",
      ],
      where: {
        Ngay: {
          [Op.between]: [startDate, yesterday],
        },
        ID_Duan: ID_Duan,
        isDelete: 0,
      },
      include: [
        {
          model: Ent_khoicv, // Lấy tên khối
          attributes: ["KhoiCV"],
        },
        {
          model: Ent_calv, // Lấy tên ca
          attributes: ["Tenca"],
        },
      ],
    });

    // Tạo dictionary để nhóm dữ liệu theo ngày và khối
    const result = {};

    dataChecklistCs.forEach((checklistC) => {
      const date = checklistC.Ngay;
      const khoiName = checklistC.ent_khoicv.KhoiCV;
      const shiftName = checklistC.ent_calv.Tenca;

      // Khởi tạo dữ liệu cho ngày nếu chưa tồn tại
      if (!result[date]) {
        result[date] = {
          date,
          createdKhois: {},
        };
      }

      // Khởi tạo dữ liệu cho khối nếu chưa tồn tại
      if (!result[date].createdKhois[khoiName]) {
        result[date].createdKhois[khoiName] = {
          shifts: {},
        };
      }

      // Khởi tạo dữ liệu cho ca nếu chưa tồn tại
      if (!result[date].createdKhois[khoiName].shifts[shiftName]) {
        result[date].createdKhois[khoiName].shifts[shiftName] = {
          totalTongC: 0,
          totalTong: checklistC.Tong,
          userCompletionRates: [],
        };
      }

      // Cộng dồn TongC và Tong cho ca
      result[date].createdKhois[khoiName].shifts[shiftName].totalTongC +=
        checklistC.TongC;

      // Lưu tỷ lệ hoàn thành của từng người
      const userCompletionRate = (checklistC.TongC / checklistC.Tong) * 100;
      result[date].createdKhois[khoiName].shifts[
        shiftName
      ].userCompletionRates.push(userCompletionRate);
    });

    // Tính toán phần trăm hoàn thành riêng cho từng ca và tổng khối
    Object.values(result).forEach((day) => {
      Object.values(day.createdKhois).forEach((khoi) => {
        let totalKhoiCompletionRatio = 0;
        let totalShifts = 0;

        Object.values(khoi.shifts).forEach((shift) => {
          // Tính phần trăm hoàn thành cho ca dựa trên tỷ lệ của từng người
          let shiftCompletionRatio = shift.userCompletionRates.reduce(
            (sum, rate) => sum + rate,
            0
          );
          if (shiftCompletionRatio > 100) {
            shiftCompletionRatio = 100;
          }

          // Tính tổng tỷ lệ hoàn thành của các ca
          totalKhoiCompletionRatio += shiftCompletionRatio;
          totalShifts += 1;
        });

        // Tính phần trăm hoàn thành trung bình cho khối
        const avgKhoiCompletionRatio = totalKhoiCompletionRatio / totalShifts;

        khoi.completionRatio = Number.isInteger(avgKhoiCompletionRatio)
          ? avgKhoiCompletionRatio
          : avgKhoiCompletionRatio.toFixed(2);
      });
    });

    // Chuyển result object thành mảng
    const resultArray = Object.values(result);

    res.status(200).json({
      message: "Trạng thái checklist trong vòng 7 ngày qua",
      data: resultArray,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.getLocationsChecklist = async (req, res) => {
  try {
    // Lấy ngày hôm qua
    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");
    const now = moment().format("YYYY-MM-DD");

    // Lấy tất cả dữ liệu checklistC cho ngày hôm qua
    const dataChecklistCs = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "ID_KhoiCV",
        "isDelete",
      ],
      where: {
        Ngay: {
          [Op.between]: [yesterday, now],
        },
        isDelete: 0,
      },
      include: [
        {
          model: Ent_duan,
          attributes: ["Duan"],
        },
        {
          model: Ent_khoicv, // Thêm bảng Ent_khoicv để lấy tên khối
          attributes: ["KhoiCV"],
        },
        {
          model: Ent_calv,
          attributes: ["Tenca"], // Lấy tên ca
        },
      ],
    });

    // Tạo một dictionary để nhóm dữ liệu theo dự án và khối
    const result = {};

    dataChecklistCs.forEach((checklistC) => {
      const projectId = checklistC.ID_Duan;
      const projectName = checklistC.ent_duan.Duan;
      const khoiName = checklistC.ent_khoicv.KhoiCV;
      const shiftName = checklistC.ent_calv.Tenca;

      // Khởi tạo dữ liệu dự án nếu chưa tồn tại
      if (!result[projectId]) {
        result[projectId] = {
          projectId,
          projectName,
          createdKhois: {},
        };
      }

      // Khởi tạo dữ liệu cho khối nếu chưa tồn tại
      if (!result[projectId].createdKhois[khoiName]) {
        result[projectId].createdKhois[khoiName] = {
          shifts: {},
        };
      }

      // Khởi tạo dữ liệu cho ca nếu chưa tồn tại
      if (!result[projectId].createdKhois[khoiName].shifts[shiftName]) {
        result[projectId].createdKhois[khoiName].shifts[shiftName] = {
          totalTongC: 0,
          totalTong: checklistC.Tong,
          userCompletionRates: [], // Lưu danh sách tỷ lệ hoàn thành của từng người
        };
      }

      // Cộng dồn TongC và Tong cho ca
      result[projectId].createdKhois[khoiName].shifts[shiftName].totalTongC +=
        checklistC.TongC;

      // Lưu tỷ lệ hoàn thành của từng người
      const userCompletionRate = (checklistC.TongC / checklistC.Tong) * 100;
      result[projectId].createdKhois[khoiName].shifts[
        shiftName
      ].userCompletionRates.push(userCompletionRate);
    });

    // Tính toán phần trăm hoàn thành riêng cho từng ca và tổng khối
    Object.values(result).forEach((project) => {
      Object.values(project.createdKhois).forEach((khoi) => {
        let totalKhoiCompletionRatio = 0;
        let totalShifts = 0;

        Object.values(khoi.shifts).forEach((shift) => {
          // Tính phần trăm hoàn thành cho ca dựa trên tỷ lệ của từng người trong ca
          let shiftCompletionRatio = shift.userCompletionRates.reduce(
            (sum, rate) => sum + rate,
            0
          );
          if (shiftCompletionRatio > 100) {
            shiftCompletionRatio = 100; // Giới hạn phần trăm hoàn thành tối đa là 100% cho từng ca
          }

          // Tính tổng tỷ lệ hoàn thành của các ca
          totalKhoiCompletionRatio += shiftCompletionRatio;
          totalShifts += 1; // Tăng số lượng ca
        });

        // Tính phần trăm hoàn thành trung bình cho khối
        const avgKhoiCompletionRatio = totalKhoiCompletionRatio / totalShifts;

        khoi.completionRatio = Number.isInteger(avgKhoiCompletionRatio)
          ? avgKhoiCompletionRatio // No decimal places, return as is
          : avgKhoiCompletionRatio.toFixed(2); // Otherwise, apply toFixed(2)
      });
    });

    // Chuyển result object thành mảng
    const resultArray = Object.values(result);

    res.status(200).json({
      message:
        "Trạng thái checklist của các dự án theo từng khối và ca làm việc",
      data: resultArray,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.checklistKhoiCVPercent = async (req, res) => {
  try {
    const userData = req.user.data;

    if (!userData) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    }

    let whereClause = {
      isDelete: 0,
      ID_Duan: userData.ID_Duan,
    };
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.fileChecklistSuCo = async (req, res) => {
  try {
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.createExcelFile = async (req, res) => {
  try {
    const list_IDChecklistC = req.body.list_IDChecklistC || [];
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;
    const tenBoPhan = req.body.tenBoPhan;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Checklist Report");

    let whereClause = {
      isDelete: 0,
      ID_ChecklistC: {
        [Op.in]: list_IDChecklistC,
      },
    };

    const dataChecklistC = await Tb_checklistchitiet.findAll({
      attributes: [
        "ID_Checklistchitiet",
        "ID_ChecklistC",
        "ID_Checklist",
        "Ketqua",
        "Anh",
        "Gioht",
        "Ghichu",
        "isDelete",
      ],
      include: [
        {
          model: Tb_checklistc,
          as: "tb_checklistc",
          attributes: [
            "ID_ChecklistC",
            "ID_Hangmucs",
            "ID_Duan",
            "ID_KhoiCV",
            "ID_Calv",
            "ID_User",
            "Ngay",
            "Tong",
            "TongC",
            "Giobd",
            "Giochupanh1",
            "Anh1",
            "Giochupanh2",
            "Anh2",
            "Giochupanh3",
            "Anh3",
            "Giochupanh4",
            "Anh4",
            "Giokt",
            "Ghichu",
            "Tinhtrang",
            "isDelete",
          ],
          include: [
            {
              model: Ent_khoicv,
              attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
            },
            {
              model: Ent_user,
              attributes: ["ID_User", "Hoten", "ID_Chucvu"],
            },
            {
              model: Ent_calv,
              attributes: ["Tenca", "Giobatdau", "Gioketthuc"],
            },
          ],
        },
        {
          model: Ent_checklist,
          attributes: [
            "ID_Checklist",
            "ID_Khuvuc",
            "ID_Hangmuc",
            "ID_Tang",
            "Sothutu",
            "Maso",
            "MaQrCode",
            "Checklist",
            "Giatridinhdanh",
            "isCheck",
            "Giatrinhan",
          ],
          include: [
            {
              model: Ent_khuvuc,
              attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],

              include: [
                {
                  model: Ent_toanha,
                  attributes: ["Toanha", "ID_Duan"],

                  include: [
                    {
                      model: Ent_duan,
                      attributes: ["Duan"],
                    },
                  ],
                },
              ],
            },
            {
              model: Ent_hangmuc,
              as: "ent_hangmuc",
              attributes: [
                "Hangmuc",
                "Tieuchuankt",
                "ID_Khuvuc",
                "MaQrCode",
                "FileTieuChuan",
                "isDelete",
              ],
            },
            {
              model: Ent_tang,
              attributes: ["Tentang"],
            },
            {
              model: Ent_user,
              attributes: [
                "UserName",
                "Email",
                "Hoten",
                "Ngaysinh",
                "Gioitinh",
                "Sodienthoai",
              ],
            },
          ],
        },
      ],
      where: whereClause,
    });

    worksheet.columns = [
      { header: "STT", key: "stt", width: 5 },
      { header: "Checklist", key: "checklist", width: 25 },
      { header: "Tầng", key: "tang", width: 10 },
      { header: "Khu vực", key: "khuvuc", width: 15 },
      { header: "Hạng mục", key: "hangmuc", width: 15 },
      { header: "Ngày", key: "ngay", width: 15 },
      { header: "Ca", key: "ca", width: 10 },
      { header: "Nhân viên", key: "nhanvien", width: 20 },
      { header: "Ghi nhận lỗi", key: "ghinhanloi", width: 20 },
      { header: "Thời gian lỗi", key: "thoigianloi", width: 20 },
      { header: "Hình ảnh", key: "hinhanh", width: 100, height: 100 },
      { header: "Ghi chú", key: "ghichuloi", width: 20 },
      { header: "Tình trạng xử lý", key: "tinhtrang", width: 20 },
    ];

    worksheet.mergeCells("A1:J1");
    const headerRow = worksheet.getCell("A1");
    headerRow.value = "BÁO CÁO CHECKLIST CÓ VẤN ĐỀ";
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.font = { size: 16, bold: true };

    worksheet.mergeCells("A3:B3");
    worksheet.getCell("A3").value = startDate
      ? `Từ ngày: ${moment(startDate).format("DD/MM/YYYY")}`
      : `Từ ngày:`;

    worksheet.mergeCells("C3:D3");
    worksheet.getCell("C3").value = endDate
      ? `Đến ngày: ${moment(endDate).format("DD/MM/YYYY")}`
      : `Đến ngày:`;

    worksheet.mergeCells("E3:F3");
    worksheet.getCell("E3").value = `Tên Bộ phận: ${tenBoPhan}`;

    const tableHeaderRow = worksheet.getRow(5);
    tableHeaderRow.values = [
      "STT",
      "Checklist",
      "Tầng",
      "Khu vực",
      "Hạng mục",
      "Ngày",
      "Ca",
      "Nhân viên",
      "Ghi nhận lỗi",
      "Thời gian lỗi",
      "Hình ảnh",
      "Đường dẫn ảnh",
      "Ghi chú",
      "Tình trạng xử lý",
    ];
    tableHeaderRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Add data rows
    for (let i = 0; i < dataChecklistC.length; i++) {
      const rowIndex = i + 6; // Adjust for header rows

      // Add text data to the row
      worksheet.addRow([
        i + 1,
        dataChecklistC[i]?.ent_checklist?.Checklist,
        dataChecklistC[i]?.ent_checklist?.ent_tang?.Tentang,
        dataChecklistC[i]?.ent_checklist?.ent_khuvuc?.Tenkhuvuc,
        dataChecklistC[i]?.ent_checklist?.ent_hangmuc?.Hangmuc,
        dataChecklistC[i]?.tb_checklistc?.Ngay,
        dataChecklistC[i]?.tb_checklistc?.ent_calv?.Tenca,
        dataChecklistC[i]?.tb_checklistc?.ent_user?.Hoten,
        dataChecklistC[i]?.Ketqua,
        dataChecklistC[i]?.Gioht,
        "", // Placeholder for the image
        `https://lh3.googleusercontent.com/d/${dataChecklistC[i]?.Anh}=s1000?authuser=0`,
        dataChecklistC[i]?.Ghichu,
        dataChecklistC[i]?.ent_checklist?.Tinhtrang == 1
          ? "Chưa xử lý"
          : "Đã xử lý",
      ]);

      // Download the image and add it to the Excel file
      if (dataChecklistC[i]?.Anh) {
        const imageUrl = `https://lh3.googleusercontent.com/d/${dataChecklistC[i]?.Anh}=s1000?authuser=0`;
        const imagePath = path.join(__dirname, `image_${i}.png`);

        // Download the image
        const response = await axios({
          url: imageUrl,
          responseType: "arraybuffer",
        });

        fs.writeFileSync(imagePath, response.data);

        // Add image to the worksheet
        const imageId = workbook.addImage({
          filename: imagePath,
          extension: "png",
        });

        worksheet.addImage(imageId, {
          tl: { col: 10, row: rowIndex - 1 },
          ext: { width: 100, height: 100 },
        });
      }
    }

    // Generate the Excel file buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Clean up the downloaded images
    for (let i = 0; i < dataChecklistC.length; i++) {
      const imagePath = path.join(__dirname, `image_${i}.png`);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Checklist_Report.xlsx"
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.createExcelTongHopCa = async (req, res) => {
  try {
    const keyCreate = req.params.id;
    const { startDate, endDate, ID_KhoiCVs } = req.body;
    const userData = req.user.data;
    const startDateFormat = formatDate(startDate);
    const endDateFormat = formatDate(endDate);

    const startDateShow = formatDateShow(startDate);
    const endDateShow = formatDateEnd(endDate);

    const workbook = new ExcelJS.Workbook();
    if (keyCreate == 1) {
      const worksheet = workbook.addWorksheet("Tổng hợp ca Checklist");
      let whereClause = {
        isDelete: 0,
        ID_Duan: userData.ID_Duan,
        Ngay: {
          [Op.gte]: startDateFormat,
          [Op.lte]: endDateFormat,
        },
      };

      const dataChecklist = await Tb_checklistc.findAll({
        attributes: [
          "ID_ChecklistC",
          "ID_Duan",
          "ID_KhoiCV",
          "ID_Calv",
          "ID_ThietLapCa",
          "ID_User",
          "Ngay",
          "Tong",
          "TongC",
          "Ghichu",
          "isDelete",
        ],
        include: [
          {
            model: Ent_khoicv,
            attributes: ["KhoiCV"],
          },
          {
            model: Ent_calv,
            attributes: ["Tenca"],
          },
          {
            model: Ent_duan,
            attributes: ["Duan", "Logo"],
          },
        ],
        where: whereClause,
      });
 // Đầy
 // Đầy 
      // Create a map to aggregate data by shift (ca) and date
      const aggregatedData = {};
      dataChecklist.forEach((item) => {
        const shiftKey = `${item.Ngay}-${item.ent_calv.Tenca}-${item.ent_khoicv?.KhoiCV}`;

        if (!aggregatedData[shiftKey]) {
          aggregatedData[shiftKey] = {
            Ngay: item.Ngay,
            Tenca: item.ent_calv.Tenca,
            KhoiCV: item.ent_khoicv?.KhoiCV,
            TongC: 0,
            Tong: item.Tong,
            Ghichu: item.Ghichu,
          };
          aggregatedData[shiftKey].TongC += item.TongC;
        }
      });

      worksheet.columns = [
        { header: "STT", key: "stt", width: 5 },
        { header: "Ngày", key: "ngay", width: 15 },
        { header: "Ca", key: "ca", width: 15 },
        { header: "Bộ phận", key: "bophan", width: 15 },
        { header: "Tổng phải Checklist", key: "tongphaichecklist", width: 20 },
        { header: "Đã thực hiện", key: "dathuchien", width: 20 },
        { header: "Tỷ lệ thực hiện (%)", key: "tylethuchien", width: 20 },
        { header: "Ghi chú", key: "ghichuloi", width: 30 },
      ];
      const projectData =
        dataChecklist.length > 0 ? dataChecklist[0].ent_duan : {};
      const projectName = projectData?.Duan || "Tên dự án không có";
      const projectLogo =
        projectData?.Logo || "https://pmcweb.vn/wp-content/uploads/logo.png";

      // Download the image and add it to the workbook
      const imageResponse = await axios({
        url: projectLogo,
        responseType: "arraybuffer",
      });
      const imageBuffer = Buffer.from(imageResponse.data, "binary");

      // Add image to the merged cells A1:B1
      const imageId = workbook.addImage({
        buffer: imageBuffer,
        extension: "png",
      });
      worksheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 120, height: 60 },
      });
      worksheet.getRow(1).height = 60; // Adjust row height to fit the image
      worksheet.getRow(2).height = 25; // Adjust row height

      worksheet.getCell("A2").value = projectName; // Set project name in A2
      worksheet.getCell("A2").alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      worksheet.getCell("A2").font = { size: 13, bold: true };

      // Merge cells and set values for the report title in row 1 (C1:H1)
      worksheet.mergeCells("A1:H1");
      worksheet.getCell("A1").value =
        "BÁO CÁO TỔNG HỢP CA CHECKLIST NGĂN NGỪA RỦI RO";
      worksheet.getCell("A1").alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      worksheet.getCell("A1").font = { size: 16, bold: true };

      // Merge cells and set values for the date range in row 2 (C2:H2)
      worksheet.mergeCells("A2:H2");
      worksheet.getCell("A2").value =
        startDateShow && endDateShow
          ? `Từ ngày: ${startDateShow}  Đến ngày: ${endDateShow}`
          : `Từ ngày: `;
      worksheet.getCell("A2").alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      worksheet.getCell("A2").font = { size: 13, bold: true };

      // Set the table headers starting from row 4
      const tableHeaderRow = worksheet.getRow(4);
      tableHeaderRow.values = [
        "STT", // Header "STT" in column A, row 4
        "Ngày",
        "Ca",
        "Bộ phận",
        "Tổng phải Checklist",
        "Đã thực hiện",
        "Tỷ lệ thực hiện(%)",
        "Ghi chú",
      ];
      tableHeaderRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true, // Enable wrap text
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Add data rows starting from row 5 (after the headers in row 4)
      Object.keys(aggregatedData).forEach((key, index) => {
        const item = aggregatedData[key];
        const completion = item.TongC;
        const total = item.Tong;
        const completionPercentage =
          completion >= total ? 100 : (completion / total) * 100;
        const formattedPercentage = Number.isInteger(completionPercentage)
          ? completionPercentage.toString() // Convert to string if integer
          : completionPercentage.toFixed(2); // Use toFixed(2) for non-integer
          console.log('item.KhoiCV', item.KhoiCV)

        const newRow = worksheet.addRow([
          index + 1, // STT
          item.Ngay, // Ngày
          item.Tenca, // Ca
          item.KhoiCV, // Bộ phận
          item.Tong, // Tổng phải Checklist
          completion, // Đã thực hiện
          formattedPercentage, // Tỷ lệ thực hiện
          item.Ghichu, // Ghi chú
        ]);

        // Center align and enable wrap text for each cell in the new row
        newRow.eachCell((cell) => {
          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: true, // Enable wrap text
          };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=TongHopCa.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.send(buffer);
    }

    if (keyCreate == 2) {
      try {
        const worksheet = workbook.addWorksheet("Khẩn cấp ngoài Checklist");
        const whereFiler = {
          isDelete: 0,
          Ngaysuco: {
            [Op.gte]: startDateFormat,
            [Op.lte]: endDateFormat,
          },
        };
        const dataSuCoNgoai = await Tb_sucongoai.findAll({
          attributes: [
            "ID_Suco",
            "ID_Hangmuc",
            "ID_User",
            "Ngaysuco",
            "Giosuco",
            "Noidungsuco",
            "Tinhtrangxuly",
            "Ngayxuly",
            "isDelete",
          ],
          include: [
            {
              model: Ent_hangmuc,
              as: "ent_hangmuc",
              attributes: [
                "Hangmuc",
                "Tieuchuankt",
                "ID_Khuvuc",
                "MaQrCode",
                "FileTieuChuan",
                "isDelete",
              ],
              include: [
                {
                  model: Ent_khuvuc,
                  attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],

                  include: [
                    {
                      model: Ent_toanha,
                      attributes: ["Toanha", "ID_Duan"],
                      include: [
                        {
                          model: Ent_duan,
                          attributes: ["Duan"],
                        },
                      ],
                      where: {
                        ID_Duan: userData.ID_Duan,
                      },
                    },
                  ],
                },
              ],
            },
            {
              model: Ent_user,
              include: {
                model: Ent_chucvu,
                attributes: ["Chucvu", "Role"],
              },
              attributes: ["UserName", "Email", "Hoten"],
            },
          ],
          where: whereFiler,
        });

        worksheet.columns = [
          { header: "STT", key: "stt", width: 5 },
          { header: "Ngày", key: "ngay", width: 15 },
          { header: "Giờ", key: "gio", width: 10 },
          { header: "Nội dung sự cố", key: "nhanvien", width: 25 },
          { header: "Người báo cáo", key: "ghinhanloi", width: 20 },
        ];

        worksheet.mergeCells("A1:E1");
        const headerRow = worksheet.getCell("A1");
        headerRow.value = "BẢNG KÊ CÁC SỰ CỐ KHẨN CẤP NẰM NGOÀI CHECKLIST";
        headerRow.alignment = { horizontal: "center", vertical: "middle" };
        headerRow.font = { size: 16, bold: true };

        worksheet.mergeCells("A2:E2");
        worksheet.getCell("A2").value =
          startDateShow && endDateShow
            ? `Từ ngày: ${startDateShow}  Đến ngày: ${endDateShow}`
            : `Từ ngày: `;
        worksheet.getCell("A2").alignment = {
          horizontal: "center",
          vertical: "middle",
        };
        worksheet.getCell("A2").font = { size: 13, bold: true };

        const tableHeaderRow = worksheet.getRow(4);
        tableHeaderRow.values = [
          "STT",
          "Ngày",
          "Giờ",
          "Nội dung sự cố",
          "Người báo cáo",
        ];
        tableHeaderRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.alignment = { horizontal: "center" };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });

        // Add data rows
        for (let i = 0; i < dataSuCoNgoai.length; i++) {
          // Add text data to the row
          worksheet.addRow([
            i + 1,
            dataSuCoNgoai[i]?.Ngaysuco,
            dataSuCoNgoai[i]?.Giosuco,
            dataSuCoNgoai[i]?.Noidungsuco,
            dataSuCoNgoai[i]?.ent_user?.Hoten,
          ]);
        }

        // Generate the Excel file buffer
        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader(
          "Content-Disposition",
          "attachment; filename=KhancapngoaiCheckList.xlsx"
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.send(buffer);
      } catch (err) {
        res
          .status(500)
          .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
      }
    }

    if (keyCreate == 3) {
      try {
        const worksheet = workbook.addWorksheet("BÁO CÁO CHECKLIST CÓ VẤN ĐỀ");

        const khoiCVs = await Ent_khoicv.findAll({
          where: {
            ID_KhoiCV: {
              [Op.in]: ID_KhoiCVs, // Query for all KhoiCVs with ID 1 or 2
            },
          },
          attributes: ["ID_KhoiCV", "KhoiCV"], // Get both ID_KhoiCV and KhoiCV name
        });

        const dataFilter = khoiCVs.map((item) => item.KhoiCV);
        const tenBoPhan = dataFilter.join();

        let whereClause = {
          isDelete: 0,
          ID_Duan: userData.ID_Duan,
          ID_KhoiCV: {
            [Op.in]: ID_KhoiCVs,
          },
          Ngay: {
            [Op.gte]: startDateFormat,
            [Op.lte]: endDateFormat,
          },
        };

        const dataChecklistC = await Tb_checklistchitiet.findAll({
          attributes: [
            "ID_Checklistchitiet",
            "ID_ChecklistC",
            "ID_Checklist",
            "Ketqua",
            "Anh",
            "Gioht",
            "Ngay",
            "Ghichu",
            "isDelete",
          ],
          include: [
            {
              model: Tb_checklistc,
              as: "tb_checklistc",
              attributes: [
                "ID_ChecklistC",
                "ID_Hangmucs",
                "ID_Duan",
                "ID_KhoiCV",
                "ID_Calv",
                "ID_User",
                "Ngay",
                "Tong",
                "TongC",
                "Giobd",
                "Giochupanh1",
                "Anh1",
                "Giochupanh2",
                "Anh2",
                "Giochupanh3",
                "Anh3",
                "Giochupanh4",
                "Anh4",
                "Giokt",
                "Ghichu",
                "Tinhtrang",
                "isDelete",
              ],
              include: [
                {
                  model: Ent_khoicv,
                  attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
                },
                {
                  model: Ent_user,
                  attributes: ["ID_User", "Hoten", "ID_Chucvu"],
                },
                {
                  model: Ent_calv,
                  attributes: ["Tenca", "Giobatdau", "Gioketthuc"],
                },
                {
                  model: Ent_duan,
                  attributes: ["Duan", "Logo"],
                },
              ],
              where: whereClause,
            },
            {
              model: Ent_checklist,
              attributes: [
                "ID_Checklist",
                "ID_Khuvuc",
                "ID_Hangmuc",
                "ID_Tang",
                "Sothutu",
                "Maso",
                "MaQrCode",
                "Checklist",
                "Giatridinhdanh",
                "Tinhtrang",
                "isCheck",
                "Giatrinhan",
              ],
              include: [
                {
                  model: Ent_khuvuc,
                  attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],

                  include: [
                    {
                      model: Ent_toanha,
                      attributes: ["Toanha", "ID_Duan"],

                      include: [
                        {
                          model: Ent_duan,
                          attributes: ["Duan"],
                        },
                      ],
                    },
                  ],
                },
                {
                  model: Ent_hangmuc,
                  as: "ent_hangmuc",
                  attributes: [
                    "Hangmuc",
                    "Tieuchuankt",
                    "ID_Khuvuc",
                    "MaQrCode",
                    "FileTieuChuan",
                    "isDelete",
                  ],
                },
                {
                  model: Ent_tang,
                  attributes: ["Tentang"],
                },
                {
                  model: Ent_user,
                  attributes: [
                    "UserName",
                    "Email",
                    "Hoten",
                    "Ngaysinh",
                    "Gioitinh",
                    "Sodienthoai",
                  ],
                },
              ],
            },
          ],
          where: {
            Ngay: {
              [Op.gte]: startDateFormat,
              [Op.lte]: endDateFormat,
            },
          },
        });

        worksheet.columns = [
          { header: "STT", key: "stt", width: 5 },
          { header: "Checklist", key: "checklist", width: 15 },
          { header: "Tầng", key: "tang", width: 10 },
          { header: "Khu vực", key: "khuvuc", width: 10 },
          { header: "Hạng mục", key: "hangmuc", width: 10 },
          { header: "Ngày", key: "ngay", width: 10 },
          { header: "Ca", key: "ca", width: 10 },
          { header: "Nhân viên", key: "nhanvien", width: 10 },
          { header: "Ghi nhận lỗi", key: "ghinhanloi", width: 10 },
          { header: "Thời gian lỗi", key: "thoigianloi", width: 10 },
          {
            header: "Đường dẫn ảnh",
            key: "duongdananh",
            width: 20,
            height: 20,
          },
          { header: "Ghi chú", key: "ghichuloi", width: 20 },
          { header: "Tình trạng xử lý", key: "tinhtrang", width: 10 },
        ];

        const projectData = dataChecklistC
          ? dataChecklistC[0].tb_checklistc.ent_duan
          : {};
        const projectName = projectData?.Duan || "";
        const projectLogo =
          projectData?.Logo || "https://pmcweb.vn/wp-content/uploads/logo.png";

        // Download the image and add it to the workbook
        const imageResponse = await axios({
          url: projectLogo,
          responseType: "arraybuffer",
        });

        const imageBuffer = Buffer.from(imageResponse.data, "binary");
        worksheet.getCell("A1").alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };

        // Add image to the merged cells A1:B1
        const imageId = workbook.addImage({
          buffer: imageBuffer,
          extension: "png",
        });
        worksheet.addImage(imageId, {
          tl: { col: 0, row: 0 }, // Position for the image within the merged cells
          ext: { width: 120, height: 60 },
        });
        worksheet.getRow(1).height = 60;
        worksheet.getRow(2).height = 25;

        worksheet.mergeCells("A1:M1");
        const headerRow = worksheet.getCell("A1");
        headerRow.value = "BÁO CÁO CHECKLIST CÓ VẤN ĐỀ";
        headerRow.alignment = { horizontal: "center", vertical: "middle" };
        headerRow.font = { size: 16, bold: true };

        worksheet.mergeCells("A2:M2");
        worksheet.getCell("A2").value =
          startDateShow && endDateShow
            ? `Từ ngày: ${startDateShow}  Đến ngày: ${endDateShow}`
            : `Từ ngày: `;
        worksheet.getCell("A2").alignment = {
          horizontal: "center",
          vertical: "middle",
        };
        worksheet.getCell("A2").font = {
          size: 13,
          bold: true,
        };
        worksheet.mergeCells("A3:M3");
        worksheet.getCell("A3").value =
          startDateFormat && endDateFormat && `Tên bộ phận: ${tenBoPhan}`;
        worksheet.getCell("A3").alignment = {
          horizontal: "center",
          vertical: "middle",
        };
        worksheet.getCell("A3").font = {
          size: 13,
          bold: true,
        };

        const tableHeaderRow = worksheet.getRow(5);
        tableHeaderRow.values = [
          "STT",
          "Checklist",
          "Tầng",
          "Khu vực",
          "Hạng mục",
          "Ngày",
          "Ca",
          "Nhân viên",
          "Ghi nhận lỗi",
          "Thời gian lỗi",
          "Đường dẫn ảnh",
          "Ghi chú",
          "Tình trạng xử lý",
        ];
        tableHeaderRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: true,
          }; // Căn giữa và wrap text cho header
        });

        // Add data rows
        for (let i = 0; i < dataChecklistC.length; i++) {
          const rowIndex = i + 7; // Adjust for header rows
          const imageUrl = `https://lh3.googleusercontent.com/d/${dataChecklistC[i]?.Anh}=s1000?authuser=0`; // Image URL

          // Add text data to the row
          worksheet.addRow([
            i + 1,
            dataChecklistC[i]?.ent_checklist?.Checklist,
            dataChecklistC[i]?.ent_checklist?.ent_tang?.Tentang,
            dataChecklistC[i]?.ent_checklist?.ent_khuvuc?.Tenkhuvuc,
            dataChecklistC[i]?.ent_checklist?.ent_hangmuc?.Hangmuc,
            dataChecklistC[i]?.tb_checklistc?.Ngay,
            dataChecklistC[i]?.tb_checklistc?.ent_calv?.Tenca,
            dataChecklistC[i]?.tb_checklistc?.ent_user?.Hoten,
            dataChecklistC[i]?.Ketqua,
            dataChecklistC[i]?.Gioht,
            "", // Empty column for image hyperlink
            dataChecklistC[i]?.Ghichu,
            dataChecklistC[i]?.ent_checklist?.Tinhtrang == 1
              ? "Chưa xử lý"
              : "Đã xử lý",
          ]);

          // Add hyperlink to the image URL
          const row = worksheet.getRow(rowIndex); // Get the row that was just added
          const imageCell = row.getCell(11); // Assuming the 11th cell (change the index if needed)
          imageCell.value = {
            text: "Xem ảnh", // Display text for the hyperlink
            hyperlink: imageUrl, // Hyperlink to the image
          };

          // Center align and wrap text for each cell in the row
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.alignment = {
              horizontal: "center",
              vertical: "middle",
              wrapText: true, // Enable wrap text
            };
          });
        }

        // Generate the Excel file buffer
        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader(
          "Content-Disposition",
          "attachment; filename=Checklist_Report.xlsx"
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.send(buffer);
      } catch (error) {
        res.status(500).json({
          message: error.message || "Loi",
        });
      }
    }
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.createPreviewReports = async (req, res) => {
  try {
    const keyCreate = req.params.id;
    const { startDate, endDate, ID_KhoiCVs } = req.body;
    const userData = req.user.data;
    const startDateFormat = formatDate(startDate);
    const endDateFormat = formatDate(endDate);

    const workbook = new ExcelJS.Workbook();
    if (keyCreate == 1) {
      const worksheet = workbook.addWorksheet("Tổng hợp ca Checklist");

      let whereClause = {
        isDelete: 0,
        ID_Duan: userData.ID_Duan,
        Ngay: {
          [Op.gte]: startDateFormat,
          [Op.lte]: endDateFormat,
        },
      };

      const dataChecklist = await Tb_checklistc.findAll({
        attributes: [
          "ID_ChecklistC",
          "ID_Duan",
          "ID_KhoiCV",
          "ID_Calv",
          "ID_ThietLapCa",
          "ID_User",
          "Ngay",
          "Tong",
          "TongC",
          "Ghichu",
          "isDelete",
        ],
        include: [
          {
            model: Ent_khoicv,
            attributes: ["KhoiCV"],
          },
          {
            model: Ent_calv,
            attributes: ["Tenca"],
          },
          {
            model: Ent_duan,
            attributes: ["Duan", "Logo"],
          },
        ],
        where: whereClause,
      });

      // Create a map to aggregate data by shift (ca) and date
      const aggregatedData = {};

      dataChecklist.forEach((item, index) => {
        const shiftKey = `${item.Ngay}-${item.ent_calv.Tenca}-${item.ent_khoicv?.KhoiCV}`;

        if (!aggregatedData[shiftKey]) {
          aggregatedData[shiftKey] = {
            STT: index + 1,
            Ngay: item.Ngay,
            Tenca: item.ent_calv.Tenca,
            KhoiCV: item.ent_khoicv?.KhoiCV,
            TongC: 0,
            Tong: item.Tong,
            Ghichu: item.Ghichu,
          };
        }

        aggregatedData[shiftKey].TongC += item.TongC;
      });

      worksheet.columns = [
        { header: "STT", key: "stt", width: 5 },
        { header: "Ngày", key: "ngay", width: 15 },
        { header: "Ca", key: "ca", width: 15 },
        { header: "Bộ phận", key: "bophan", width: 15 },
        { header: "Tổng phải Checklist", key: "tongphaichecklist", width: 20 },
        { header: "Đã thực hiện", key: "dathuchien", width: 20 },
        { header: "Tỷ lệ thực hiện (%)", key: "tylethuchien", width: 20 },
        { header: "Ghi chú", key: "ghichuloi", width: 30 },
      ];

      const tableHeaderRow = worksheet.getRow(0);
      tableHeaderRow.values = [
        "STT", // Header "STT" in column A, row 4
        "Ngày",
        "Ca",
        "Bộ phận",
        "Tổng phải Checklist",
        "Đã thực hiện",
        "Tỷ lệ thực hiện(%)",
        "Ghi chú",
      ];
      tableHeaderRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true, // Enable wrap text
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Add data rows starting from row 5 (after the headers in row 4)
      Object.keys(aggregatedData).forEach((key, index) => {
        const item = aggregatedData[key];
        const completion = item.TongC;
        const total = item.Tong;
        const completionPercentage =
          completion >= total ? 100 : (completion / total) * 100;
        const formattedPercentage = Number.isInteger(completionPercentage)
          ? completionPercentage.toString() // Convert to string if integer
          : completionPercentage.toFixed(2); // Use toFixed(2) for non-integer

        const newRow = worksheet.addRow([
          index + 1, // STT
          item.Ngay, // Ngày
          item.Tenca, // Ca
          item.KhoiCV, // Bộ phận
          item.Tong, // Tổng phải Checklist
          completion, // Đã thực hiện
          formattedPercentage, // Tỷ lệ thực hiện
          item.Ghichu || "", // Ghi chú
        ]);

        // Center align and enable wrap text for each cell in the new row
        newRow.eachCell((cell) => {
          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: true, // Enable wrap text
          };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=TongHopCa.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await workbook.xlsx.load(buffer);
      const rows = [];
      worksheet.eachRow((row, rowNumber) => {
        const rowData = [];
        row.eachCell((cell, colNumber) => {
          rowData.push(cell.value);
        });
        rows.push(rowData);
      });

      res.json(rows);
      // res.send(buffer);
    }

    if (keyCreate == 2) {
      try {
        const worksheet = workbook.addWorksheet("Khẩn cấp ngoài Checklist");
        const whereFiler = {
          isDelete: 0,
          Ngaysuco: {
            [Op.gte]: startDateFormat,
            [Op.lte]: endDateFormat,
          },
        };
        const dataSuCoNgoai = await Tb_sucongoai.findAll({
          attributes: [
            "ID_Suco",
            "ID_Hangmuc",
            "ID_User",
            "Ngaysuco",
            "Giosuco",
            "Noidungsuco",
            "Tinhtrangxuly",
            "Ngayxuly",
            "isDelete",
          ],
          include: [
            {
              model: Ent_hangmuc,
              as: "ent_hangmuc",
              attributes: [
                "Hangmuc",
                "Tieuchuankt",
                "ID_Khuvuc",
                "MaQrCode",
                "FileTieuChuan",
                "isDelete",
              ],
              include: [
                {
                  model: Ent_khuvuc,
                  attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],

                  include: [
                    {
                      model: Ent_toanha,
                      attributes: ["Toanha", "ID_Duan"],
                      include: [
                        {
                          model: Ent_duan,
                          attributes: ["Duan"],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              model: Ent_user,
              include: {
                model: Ent_chucvu,
                attributes: ["Chucvu", "Role"],
              },
              attributes: ["UserName", "Email", "Hoten", "ID_Duan"],
              where: {
                ID_Duan: userData.ID_Duan,
              },
            },
          ],
          where: whereFiler,
        });

        worksheet.columns = [
          { header: "STT", key: "stt", width: 5 },
          { header: "Ngày", key: "ngay", width: 15 },
          { header: "Giờ", key: "gio", width: 10 },
          { header: "Nội dung sự cố", key: "nhanvien", width: 25 },
          { header: "Người báo cáo", key: "ghinhanloi", width: 20 },
        ];

        const tableHeaderRow = worksheet.getRow(1);
        tableHeaderRow.values = [
          "STT",
          "Ngày",
          "Giờ",
          "Nội dung sự cố",
          "Người báo cáo",
        ];
        tableHeaderRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.alignment = { horizontal: "center" };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });

        // Add data rows
        for (let i = 0; i < dataSuCoNgoai.length; i++) {
          // Add text data to the row
          worksheet.addRow([
            i + 1,
            dataSuCoNgoai[i]?.Ngaysuco,
            dataSuCoNgoai[i]?.Giosuco,
            dataSuCoNgoai[i]?.Noidungsuco,
            dataSuCoNgoai[i]?.ent_user?.Hoten,
          ]);
        }

        // Generate the Excel file buffer
        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader(
          "Content-Disposition",
          "attachment; filename=KhancapngoaiCheckList.xlsx"
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        await workbook.xlsx.load(buffer);
        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
          const rowData = [];
          row.eachCell((cell, colNumber) => {
            rowData.push(cell.value);
          });
          rows.push(rowData);
        });

        res.json(rows);
      } catch (err) {
        res
          .status(500)
          .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
      }
    }

    if (keyCreate == 3) {
      try {
        const worksheet = workbook.addWorksheet("BÁO CÁO CHECKLIST CÓ VẤN ĐỀ");

        let whereClause = {
          isDelete: 0,
          ID_Duan: userData.ID_Duan,
          ID_KhoiCV: {
            [Op.in]: ID_KhoiCVs,
          },
          Ngay: {
            [Op.gte]: startDateFormat,
            [Op.lte]: endDateFormat,
          },
        };

        const dataChecklistC = await Tb_checklistchitiet.findAll({
          attributes: [
            "ID_Checklistchitiet",
            "ID_ChecklistC",
            "ID_Checklist",
            "Ketqua",
            "Anh",
            "Ngay",
            "Gioht",
            "Ghichu",
            "isDelete",
          ],
          include: [
            {
              model: Tb_checklistc,
              as: "tb_checklistc",
              attributes: [
                "ID_ChecklistC",
                "ID_Hangmucs",
                "ID_Duan",
                "ID_KhoiCV",
                "ID_Calv",
                "ID_User",
                "Ngay",
                "Tong",
                "TongC",
                "Giobd",
                "Giochupanh1",
                "Anh1",
                "Giochupanh2",
                "Anh2",
                "Giochupanh3",
                "Anh3",
                "Giochupanh4",
                "Anh4",
                "Giokt",
                "Ghichu",
                "Tinhtrang",
                "isDelete",
              ],
              include: [
                {
                  model: Ent_khoicv,
                  attributes: ["KhoiCV", "Ngaybatdau", "Chuky"],
                },
                {
                  model: Ent_user,
                  attributes: ["ID_User", "Hoten", "ID_Chucvu"],
                },
                {
                  model: Ent_calv,
                  attributes: ["Tenca", "Giobatdau", "Gioketthuc"],
                },
                {
                  model: Ent_duan,
                  attributes: ["Duan", "Logo"],
                },
              ],
              where: whereClause,
            },
            {
              model: Ent_checklist,
              attributes: [
                "ID_Checklist",
                "ID_Khuvuc",
                "ID_Hangmuc",
                "ID_Tang",
                "Sothutu",
                "Maso",
                "MaQrCode",
                "Checklist",
                "Giatridinhdanh",
                "Tinhtrang",
                "isCheck",
                "Giatrinhan",
              ],
              include: [
                {
                  model: Ent_khuvuc,
                  attributes: ["Tenkhuvuc", "MaQrCode", "Makhuvuc", "Sothutu"],

                  include: [
                    {
                      model: Ent_toanha,
                      attributes: ["Toanha", "ID_Duan"],

                      include: [
                        {
                          model: Ent_duan,
                          attributes: ["Duan"],
                        },
                      ],
                    },
                  ],
                },
                {
                  model: Ent_hangmuc,
                  as: "ent_hangmuc",
                  attributes: [
                    "Hangmuc",
                    "Tieuchuankt",
                    "ID_Khuvuc",
                    "MaQrCode",
                    "FileTieuChuan",
                    "isDelete",
                  ],
                },
                {
                  model: Ent_tang,
                  attributes: ["Tentang"],
                },
                {
                  model: Ent_user,
                  attributes: [
                    "UserName",
                    "Email",
                    "Hoten",
                    "Ngaysinh",
                    "Gioitinh",
                    "Sodienthoai",
                  ],
                },
              ],
            },
          ],
          where: {
            Ngay: {
              [Op.gte]: startDateFormat,
              [Op.lte]: endDateFormat,
            },
            isDelete: 0,
          },
        });

        worksheet.columns = [
          { header: "STT", key: "stt", width: 5 },
          { header: "Checklist", key: "checklist", width: 15 },
          { header: "Tầng", key: "tang", width: 10 },
          { header: "Khu vực", key: "khuvuc", width: 10 },
          { header: "Hạng mục", key: "hangmuc", width: 10 },
          { header: "Ngày", key: "ngay", width: 10 },
          { header: "Ca", key: "ca", width: 10 },
          { header: "Nhân viên", key: "nhanvien", width: 10 },
          { header: "Ghi nhận lỗi", key: "ghinhanloi", width: 10 },
          { header: "Thời gian lỗi", key: "thoigianloi", width: 10 },
          { header: "Ghi chú", key: "ghichuloi", width: 20 },
          { header: "Tình trạng xử lý", key: "tinhtrang", width: 10 },
        ];

        const tableHeaderRow = worksheet.getRow(1);
        tableHeaderRow.values = [
          "STT",
          "Checklist",
          "Tầng",
          "Khu vực",
          "Hạng mục",
          "Ngày",
          "Ca",
          "Nhân viên",
          "Ghi nhận lỗi",
          "Thời gian lỗi",
          "Ghi chú",
          "Tình trạng xử lý",
        ];
        tableHeaderRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: true,
          }; // Căn giữa và wrap text cho header
        });

        // Add data rows
        for (let i = 0; i < dataChecklistC.length; i++) {
          const rowIndex = i + 1; // Adjust for header rows

          // Add text data to the row
          worksheet.addRow([
            i + 1,
            dataChecklistC[i]?.ent_checklist?.Checklist,
            dataChecklistC[i]?.ent_checklist?.ent_tang?.Tentang,
            dataChecklistC[i]?.ent_checklist?.ent_khuvuc?.Tenkhuvuc,
            dataChecklistC[i]?.ent_checklist?.ent_hangmuc?.Hangmuc,
            dataChecklistC[i]?.tb_checklistc?.Ngay,
            dataChecklistC[i]?.tb_checklistc?.ent_calv?.Tenca,
            dataChecklistC[i]?.tb_checklistc?.ent_user?.Hoten,
            dataChecklistC[i]?.Ketqua,
            dataChecklistC[i]?.Gioht,

            dataChecklistC[i]?.Ghichu,
            dataChecklistC[i]?.ent_checklist?.Tinhtrang == 1
              ? "Chưa xử lý"
              : "Đã xử lý",
          ]);

          // Add hyperlink to the image URL
          const row = worksheet.getRow(rowIndex);

          // Center align and wrap text for each cell in the row
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.alignment = {
              horizontal: "center",
              vertical: "middle",
              wrapText: true, // Enable wrap text
            };
          });
        }

        // Generate the Excel file buffer
        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader(
          "Content-Disposition",
          "attachment; filename=Checklist_Report.xlsx"
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        await workbook.xlsx.load(buffer);
        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
          const rowData = [];
          row.eachCell((cell, colNumber) => {
            rowData.push(cell.value);
          });
          rows.push(rowData);
        });

        res.json(rows);
      } catch (error) {
        res.status(500).json({
          message: error.message || "Loi",
        });
      }
    }
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Lỗi! Vui lòng thử lại sau." });
  }
};

exports.createExcelThongKeTraCuu = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      ID_Khuvucs,
      ID_Hangmucs,
      ID_Checklists,
      ID_Users,
      ID_Calvs,
    } = req.body;
    const userData = req.user.data;
  } catch (error) { }
};

exports.createExcelDuAn = async (req, res) => {
  try {
    // const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("CheckList Projects");

    // Thêm các tiêu đề cột cho bảng Excel
    worksheet.columns = [
      { header: "Thuộc CN", key: "nhom", width: 20 },
      { header: "Tên dự án", key: "tenduan", width: 25 },
      { header: "Kỹ thuật", key: "kythuat", width: 10 },
      { header: "Làm sạch", key: "lamsach", width: 10 },
      { header: "An ninh", key: "anninh", width: 10 },
      { header: "Dịch vụ", key: "dichvu", width: 10 },
      { header: "F&B", key: "fb", width: 10 },
      { header: "Tỉ lệ checklist", key: "tile", width: 10 },
      { header: "Đã triển khai", key: "dachay", width: 10 },
      { header: "Ghi chú", key: "ghichu", width: 20 },
    ];

    // Lấy tất cả dữ liệu checklistC cho ngày hôm qua
    const dataChecklistCs = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "ID_KhoiCV",
        "isDelete",
      ],
      where: {
        isDelete: 0,
        ID_Duan: {
          [Op.ne]: 1,
        },
        // Ngay: yesterday
      },
      include: [
        {
          model: Ent_duan,
          attributes: ["Duan"],
          where: {
            ID_Duan: {
              [Op.ne]: 1,
            },
          },
          include: [
            {
              model: Ent_chinhanh,
              attributes: ["Tenchinhanh"],
            },
          ],
        },
        {
          model: Ent_khoicv,
          attributes: ["KhoiCV"],
        },
        {
          model: Ent_calv,
          attributes: ["Tenca", "isDelete"],
          where: {
            isDelete: 0,
          },
        },
      ],
    });

    const result = {};

    dataChecklistCs.forEach((checklistC) => {
      const projectId = checklistC.ID_Duan;
      const projectName = checklistC.ent_duan.Duan;
      const projectChinhanh = checklistC.ent_duan.ent_chinhanh.Tenchinhanh;
      const khoiName = checklistC.ent_khoicv.KhoiCV;
      const shiftName = checklistC.ent_calv.Tenca;

      // Khởi tạo dữ liệu dự án nếu chưa tồn tại
      if (!result[projectId]) {
        result[projectId] = {
          projectId,
          projectName,
          projectChinhanh,
          createdKhois: {},
        };
      }

      // Khởi tạo dữ liệu cho khối nếu chưa tồn tại
      if (!result[projectId].createdKhois[khoiName]) {
        result[projectId].createdKhois[khoiName] = {
          shifts: {},
        };
      }

      // Khởi tạo dữ liệu cho ca nếu chưa tồn tại
      if (!result[projectId].createdKhois[khoiName].shifts[shiftName]) {
        result[projectId].createdKhois[khoiName].shifts[shiftName] = {
          totalTongC: 0,
          totalTong: 0,
          userCompletionRates: [], // Lưu danh sách tỷ lệ hoàn thành của từng người
        };
      }

      // Cộng dồn TongC và Tong cho ca
      result[projectId].createdKhois[khoiName].shifts[shiftName].totalTongC +=
        checklistC.TongC;
      result[projectId].createdKhois[khoiName].shifts[shiftName].totalTong =
        checklistC.Tong;

      // Lưu tỷ lệ hoàn thành của từng người
      if (checklistC.Tong > 0) {
        const userCompletionRate = (checklistC.TongC / checklistC.Tong) * 100;
        result[projectId].createdKhois[khoiName].shifts[
          shiftName
        ].userCompletionRates.push(userCompletionRate);
        console.log(`Tỷ lệ hoàn thành của ca: ${userCompletionRate}%`);
      } else {
        console.log(`Tỷ lệ hoàn thành của ca: 0% (Tong = 0)`);
      }
    });

    // Tính toán phần trăm hoàn thành riêng cho từng ca và tổng khối
    Object.values(result).forEach((project) => {
      Object.values(project.createdKhois).forEach((khoi) => {
        let totalKhoiCompletionRatio = 0;
        let totalShifts = 0;

        Object.values(khoi.shifts).forEach((shift) => {
          // Tính phần trăm hoàn thành cho ca dựa trên tỷ lệ của từng người trong ca
          let shiftCompletionRatio = shift.userCompletionRates.reduce(
            (sum, rate) => sum + rate,
            0
          );
          if (shiftCompletionRatio > 100) {
            shiftCompletionRatio = 100; // Giới hạn phần trăm hoàn thành tối đa là 100% cho từng ca
          }

          // Tính tổng tỷ lệ hoàn thành của các ca
          totalKhoiCompletionRatio += shiftCompletionRatio;
          totalShifts += 1; // Tăng số lượng ca
        });

        // Tính phần trăm hoàn thành trung bình cho khối
        const avgKhoiCompletionRatio = totalKhoiCompletionRatio / totalShifts;

        khoi.completionRatio = Number.isInteger(avgKhoiCompletionRatio)
          ? avgKhoiCompletionRatio // No decimal places, return as is
          : avgKhoiCompletionRatio.toFixed(2); // Otherwise, apply toFixed(2)
      });
    });

    // Chuyển result object thành mảng
    const resultArray = Object.values(result);

    const sortedResultArray = resultArray.sort((a, b) => {
      if (a.projectChinhanh < b.projectChinhanh) {
        return -1; // a trước b
      }
      if (a.projectChinhanh > b.projectChinhanh) {
        return 1; // a sau b
      }
      return 0; // nếu bằng nhau, giữ nguyên thứ tự
    });

    // Duyệt qua từng dự án và thêm vào bảng
    sortedResultArray.forEach((project, index) => {
      const { projectName, createdKhois, projectChinhanh } = project;
      let rowValues = {
        nhom: projectChinhanh, // Thuộc CN
        tenduan: projectName,
        kythuat: "",
        lamsach: "",
        anninh: "",
        dichvu: "",
        fb: "",
        dachay: "",
        ghichu: "",
      };

      let totalChecklistPercentage = 0;
      let numKhoisWithData = 0;

      // Kiểm tra từng khối công việc
      Object.keys(createdKhois).forEach((khoiName) => {
        const khoi = createdKhois[khoiName];
        let totalKhoiCompletionRatio = 0;
        let totalShifts = 0;

        // Kiểm tra từng ca làm việc trong khối
        Object.keys(khoi.shifts).forEach((shiftName) => {
          const shift = khoi.shifts[shiftName];
          const completionRate = shift.userCompletionRates.reduce(
            (sum, rate) => sum + rate,
            0
          );

          const shiftCompletionRatio = Math.min(completionRate, 100);

          // Chỉ tính khi completionRate > 0
          if (completionRate > 0) {
            totalKhoiCompletionRatio += shiftCompletionRatio;
            totalShifts += 1;
            rowValues.dachay = "✔️"; // Nếu có tỷ lệ hoàn thành, đặt dấu ✔️
          }
        });

        // Tính phần trăm hoàn thành trung bình cho khối
        if (totalShifts > 0) {
          const avgKhoiCompletionRatio = totalKhoiCompletionRatio / totalShifts;

          // Cộng tổng tỷ lệ của khối vào tổng tỷ lệ checklist chung
          totalChecklistPercentage += avgKhoiCompletionRatio;
          numKhoisWithData += 1; // Tăng số khối có dữ liệu
        }

        // Điền dữ liệu cho các khối cụ thể
        if (khoiName === "Khối kỹ thuật") {
          rowValues.kythuat = "X";
        }
        if (khoiName === "Khối làm sạch") {
          rowValues.lamsach = "X";
        }
        if (khoiName === "Khối bảo vệ") {
          rowValues.anninh = "X";
        }
        if (khoiName === "Khối dịch vụ") {
          rowValues.dichvu = "X";
        }
        if (khoiName === "Khối F&B") {
          rowValues.fb = "X";
        }
      });

      // Tính tỷ lệ checklist trung bình
      let tileChecklist = 0;
      if (numKhoisWithData > 0) {
        tileChecklist = totalChecklistPercentage / numKhoisWithData;
      }

      // Đảm bảo không có giá trị NaN và chỉ hiển thị khi có giá trị hợp lệ
      rowValues.tile = isNaN(tileChecklist)
        ? "N/A"
        : tileChecklist.toFixed(2) + "%";

      // Thêm dữ liệu vào bảng
      worksheet.addRow(rowValues);
    });

    // Tạo file buffer để xuất file Excel
    const buffer = await workbook.xlsx.writeBuffer();

    await workbook.xlsx.load(buffer);
    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      const rowData = [];
      row.eachCell((cell, colNumber) => {
        rowData.push(cell.value);
      });
      rows.push(rowData);
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};

exports.createExcelDuAnPercent = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("CheckList Projects");

    // Thêm các tiêu đề cột cho bảng Excel
    worksheet.columns = [
      { header: "Thuộc CN", key: "nhom", width: 20 },
      { header: "Tên dự án", key: "tenduan", width: 25 },
      { header: "Kỹ thuật", key: "kythuat", width: 10 },
      { header: "Làm sạch", key: "lamsach", width: 10 },
      { header: "An ninh", key: "anninh", width: 10 },
      { header: "Dịch vụ", key: "dichvu", width: 10 },
      { header: "F&B", key: "fb", width: 10 },
      { header: "Tỉ lệ checklist", key: "tile", width: 10 },
      { header: "Đã triển khai", key: "dachay", width: 10 },
      { header: "Ghi chú", key: "ghichu", width: 20 },
    ];

    // Lấy tất cả dữ liệu checklistC cho ngày hôm qua
    const dataChecklistCs = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_Calv",
        "Ngay",
        "TongC",
        "Tong",
        "ID_KhoiCV",
        "isDelete",
      ],
      where: {
        isDelete: 0,
        ID_Duan: {
          [Op.ne]: 1,
        },
      },
      include: [
        {
          model: Ent_duan,
          attributes: ["Duan"],
          where: {
            ID_Duan: {
              [Op.ne]: 1,
            },
          },
          include: [
            {
              model: Ent_chinhanh,
              attributes: ["Tenchinhanh"],
            },
          ],
        },
        {
          model: Ent_khoicv,
          attributes: ["KhoiCV"],
        },
        {
          model: Ent_calv,
          attributes: ["Tenca", "isDelete"],
          where: {
            isDelete: 0,
          },
        },
      ],
    });

    const result = {};

    dataChecklistCs.forEach((checklistC) => {
      const projectId = checklistC.ID_Duan;
      const projectName = checklistC.ent_duan.Duan;
      const projectChinhanh = checklistC.ent_duan.ent_chinhanh.Tenchinhanh;
      const khoiName = checklistC.ent_khoicv.KhoiCV;
      const shiftName = checklistC.ent_calv.Tenca;

      // Khởi tạo dữ liệu dự án nếu chưa tồn tại
      if (!result[projectId]) {
        result[projectId] = {
          projectId,
          projectName,
          projectChinhanh,
          createdKhois: {},
        };
      }

      // Khởi tạo dữ liệu cho khối nếu chưa tồn tại
      if (!result[projectId].createdKhois[khoiName]) {
        result[projectId].createdKhois[khoiName] = {
          shifts: {},
        };
      }

      // Khởi tạo dữ liệu cho ca nếu chưa tồn tại
      if (!result[projectId].createdKhois[khoiName].shifts[shiftName]) {
        result[projectId].createdKhois[khoiName].shifts[shiftName] = {
          totalTongC: 0,
          totalTong: 0,
          userCompletionRates: [], // Lưu danh sách tỷ lệ hoàn thành của từng người
        };
      }

      // Cộng dồn TongC và Tong cho ca
      result[projectId].createdKhois[khoiName].shifts[shiftName].totalTongC +=
        checklistC.TongC;
      result[projectId].createdKhois[khoiName].shifts[shiftName].totalTong =
        checklistC.Tong;

      // Lưu tỷ lệ hoàn thành của từng người
      if (checklistC.Tong > 0) {
        const userCompletionRate = (checklistC.TongC / checklistC.Tong) * 100;
        result[projectId].createdKhois[khoiName].shifts[shiftName].userCompletionRates.push(userCompletionRate);
      }
    });

    // Tính toán phần trăm hoàn thành riêng cho từng ca và tổng khối
    Object.values(result).forEach((project) => {
      Object.values(project.createdKhois).forEach((khoi) => {
        let totalKhoiCompletionRatio = 0;
        let totalShifts = 0;

        Object.values(khoi.shifts).forEach((shift) => {
          let shiftCompletionRatio = shift.userCompletionRates.reduce(
            (sum, rate) => sum + rate,
            0
          );
          if (shiftCompletionRatio > 100) {
            shiftCompletionRatio = 100;
          }

          totalKhoiCompletionRatio += shiftCompletionRatio;
          totalShifts += 1;
        });

        const avgKhoiCompletionRatio = totalKhoiCompletionRatio / totalShifts;

        khoi.completionRatio = avgKhoiCompletionRatio.toFixed(2);
      });
    });

    // Chuyển result object thành mảng
    const resultArray = Object.values(result);

    const sortedResultArray = resultArray.sort((a, b) => {
      return a.projectChinhanh.localeCompare(b.projectChinhanh);
    });

    // Duyệt qua từng dự án và thêm vào bảng
    sortedResultArray.forEach((project) => {
      const { projectName, createdKhois, projectChinhanh } = project;
      let rowValues = {
        nhom: projectChinhanh,
        tenduan: projectName,
        kythuat: "",
        lamsach: "",
        anninh: "",
        dichvu: "",
        fb: "",
        dachay: "",
        ghichu: "",
      };

      let totalChecklistPercentage = 0;
      let numKhoisWithData = 0;

      Object.keys(createdKhois).forEach((khoiName) => {
        const khoi = createdKhois[khoiName];
        let totalKhoiCompletionRatio = 0;
        let totalShifts = 0;

        Object.keys(khoi.shifts).forEach((shiftName) => {
          const shift = khoi.shifts[shiftName];
          const completionRate = shift.userCompletionRates.reduce(
            (sum, rate) => sum + rate,
            0
          );

          const shiftCompletionRatio = Math.min(completionRate, 100);

          if (completionRate > 0) {
            totalKhoiCompletionRatio += shiftCompletionRatio;
            totalShifts += 1;
            rowValues.dachay = "✔️";
          }
        });

        if (totalShifts > 0) {
          const avgKhoiCompletionRatio = totalKhoiCompletionRatio / totalShifts;
          totalChecklistPercentage += avgKhoiCompletionRatio;
          numKhoisWithData += 1;
        }

        if (khoiName === "Khối kỹ thuật") {
          rowValues.kythuat = "X";
        }
        if (khoiName === "Khối làm sạch") {
          rowValues.lamsach = "X";
        }
        if (khoiName === "Khối bảo vệ") {
          rowValues.anninh = "X";
        }
        if (khoiName === "Khối dịch vụ") {
          rowValues.dichvu = "X";
        }
        if (khoiName === "Khối F&B") {
          rowValues.fb = "X";
        }
      });

      let tileChecklist = 0;
      if (numKhoisWithData > 0) {
        tileChecklist = totalChecklistPercentage / numKhoisWithData;
      }

      rowValues.tile = isNaN(tileChecklist) ? "N/A" : tileChecklist.toFixed(2) + "%";

      worksheet.addRow(rowValues);
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=CheckList_Projects.xlsx"
    );

    res.end(buffer);

  } catch (err) {
    res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};


async function processData(data) {
  const aggregatedData = {};

  data.forEach((item) => {
    const { label, totalAmount, value } = item;

    if (!aggregatedData[label]) {
      aggregatedData[label] = {
        totalAmount: 0,
        totalValue: 0,
        count: 0,
      };
    }

    aggregatedData[label].totalAmount += totalAmount;
    if (value !== null) {
      aggregatedData[label].totalValue += parseFloat(value);
      aggregatedData[label].count++;
    }
  });

  const finalData = [];

  for (const label in aggregatedData) {
    const { totalAmount, totalValue, count } = aggregatedData[label];
    finalData.push({
      label,
      totalAmount,
      value: count > 0 ? (totalValue / count).toFixed(4) : null,
    });
  }

  return finalData;
}

function formatDate(dateStr) {
  const date = new Date(dateStr); // Convert the string to a Date object
  if (isNaN(date)) {
    return "Invalid Date"; // Handle any invalid date input
  }

  date.setUTCDate(date.getUTCDate() + 1); // Adjusting date if needed
  date.setUTCHours(0, 0, 0, 0); // Set hour, minute, second, and millisecond to zero

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0"); // Months are zero-based
  const year = date.getUTCFullYear();

  return `${year}-${month}-${day} 00:00:00`;
}

function formatDateShow(dateStr) {
  const date = new Date(dateStr); // Convert the string to a Date object
  if (isNaN(date)) {
    return "Invalid Date"; // Handle any invalid date input
  }

  date.setUTCDate(date.getUTCDate() + 1); // Adjusting date if needed

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0"); // Months are zero-based
  const year = date.getUTCFullYear();

  return `${year}-${month}-${day}`;
}

function formatDateEnd(dateStr) {
  const date = new Date(dateStr); // Convert the string to a Date object
  if (isNaN(date)) {
    return "Invalid Date"; // Handle any invalid date input
  }

  date.setUTCDate(date.getUTCDate()); // Adjusting date if needed

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0"); // Months are zero-based
  const year = date.getUTCFullYear();

  return `${year}-${month}-${day}`;
}

cron.schedule("0 */2 * * *", async function () {
  console.log("---------------------");
  console.log("Running Cron Job");

  const currentDate = new Date();
  const currentDateString = currentDate.toISOString().split("T")[0];
  const currentDateTime = moment(currentDate).format("HH:mm:ss");

  // Tính toán ngày hôm qua
  const yesterdayDateTime = new Date(currentDate);
  yesterdayDateTime.setDate(currentDate.getDate() - 1);
  const yesterdayDateString = yesterdayDateTime.toISOString().split("T")[0];

  try {
    // Tìm các bản ghi của ngày hôm qua
    const yesterdayResults = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_KhoiCV",
        "ID_Calv",
        "ID_User",
        "Ngay",
        "Tong",
        "TongC",
        "Giobd",
        "Giokt",
        "Tinhtrang",
        "isDelete",
      ],
      where: {
        isDelete: 0,
        Tinhtrang: 0,
        Ngay: yesterdayDateString,
      },
    });

    // Cập nhật tất cả bản ghi của ngày hôm qua với Tinhtrang: 1
    const yesterdayUpdates = yesterdayResults.map((record) => {
      return Tb_checklistc.update(
        { Tinhtrang: 1, Giokt: currentDateTime },
        { where: { ID_ChecklistC: record.ID_ChecklistC } }
      );
    });

    await Promise.all(yesterdayUpdates);
    console.log("Updated all records for yesterday");

    // Tìm các bản ghi của ngày hôm nay
    const todayResults = await Tb_checklistc.findAll({
      attributes: [
        "ID_ChecklistC",
        "ID_Duan",
        "ID_KhoiCV",
        "ID_Calv",
        "ID_User",
        "Ngay",
        "Tong",
        "TongC",
        "Giobd",
        "Giokt",
        "Tinhtrang",
        "isDelete",
      ],
      include: [
        {
          model: Ent_calv,
          attributes: ["Giobatdau", "Gioketthuc"],
        },
      ],
      where: {
        isDelete: 0,
        Tinhtrang: 0,
        Ngay: currentDateString,
      },
    });

    const formattedTime = currentDate.toLocaleTimeString("en-GB", {
      hour12: false,
    });

    const updates = todayResults.map((record) => {
      const { Gioketthuc, Giobatdau } = record.ent_calv;

      if (Giobatdau < Gioketthuc && currentDateTime >= Gioketthuc) {
        return Tb_checklistc.update(
          { Tinhtrang: 1, Giokt: formattedTime },
          { where: { ID_ChecklistC: record.ID_ChecklistC } }
        );
      }

      if (
        Giobatdau >= Gioketthuc &&
        currentDateTime < Giobatdau &&
        currentDateTime >= Gioketthuc
      ) {
        return Tb_checklistc.update(
          { Tinhtrang: 1, Giokt: formattedTime },
          { where: { ID_ChecklistC: record.ID_ChecklistC } }
        );
      }
    });

    await Promise.all(updates);
    console.log("Updated records for today based on ca conditions");

    console.log("============================");
  } catch (error) {
    console.error("Error running cron job:", error);
  }
});
