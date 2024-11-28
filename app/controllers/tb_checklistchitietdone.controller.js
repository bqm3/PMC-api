const {
  Tb_checklistchitietdone,
  Tb_checklistc,
  Ent_checklist,
} = require("../models/setup.model");
const sequelize = require("../config/db.config");
const { Op, Sequelize } = require("sequelize");

exports.create = async (req, res) => {
  try {
    const userData = req.user.data;
    const transaction = await sequelize.transaction();

    if (!userData) {
      res.status(401).json({
        message: "Bạn không có quyền tạo dự án!",
      });
      return;
    }

    const {
      ID_Checklists,
      Description,
      checklistLength,
      ID_ChecklistC,
      Vido,
      Kinhdo,
      Docao,
      Gioht,
      isScan,
      isCheckListLai,
      valueChecks, // This is the array of values for Ketqua
    } = req.body;

    if (!Description || !Gioht) {
      res.status(400).json({
        message: "Không thể checklist dữ liệu!",
      });
      return;
    }

    // Create a Tb_checklistchitietdone data object
    const data = {
      ID_ChecklistC: ID_ChecklistC || null,
      Description: Description || "",
      Gioht: Gioht,
      Vido: Vido || null,
      Kinhdo: Kinhdo || null,
      Docao: Docao || null,
      isScan: isScan || null,
      isCheckListLai: isCheckListLai || 0,
      isDelete: 0,
    };

    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, "0"); // Month
    const year = d.getFullYear(); // Year
    const dynamicTableName = `tb_checklistchitietdone_${month}_${year}`;
    

    try {
      // Create dynamic table if it doesn't exist
      // await sequelize.query(
      //   `
      //     CREATE TABLE IF NOT EXISTS ${dynamicTableName} (
      //       ID_ChecklistC INT,
      //       Description TEXT,
      //       Gioht TIME,
      //       Vido VARCHAR(50) DEFAULT NULL,
      //       Kinhdo VARCHAR(50) DEFAULT NULL,
      //       Docao VARCHAR(50) DEFAULT NULL,
      //       isScan INT DEFAULT NULL,
      //       isCheckListLai INT DEFAULT 0
      //     );
      //   `,
      //   { transaction }
      // );

      // // Insert data into the dynamic table
      // const insertQuery = `
      //   INSERT INTO ${dynamicTableName} 
      //     (ID_ChecklistC, Description, Gioht, Vido, Kinhdo, Docao, isScan, isCheckListLai)
      //   VALUES (
      //     ${ID_ChecklistC},
      //     '${Description}',
      //     '${Gioht}',
      //     ${Vido},
      //     ${Kinhdo},
      //     ${Docao},
      //     ${isScan},
      //     ${isCheckListLai || 0}
      //   );
      // `;

      // await sequelize.query(insertQuery, {
      //   type: sequelize.QueryTypes.INSERT,
      //   transaction,
      // });

      // Save to Tb_checklistchitietdone table
      const createdData = await Tb_checklistchitietdone.create(data, { transaction });

      // Check if current TongC is less than total Tong in Tb_checklistc
      const checklistC = await Tb_checklistc.findOne({
        attributes: ["ID_ChecklistC", "TongC", "Tong"],
        where: { ID_ChecklistC },
        transaction,
      });

      if (checklistC) {
        const currentTongC = checklistC.TongC;
        const totalTong = checklistC.Tong;

        if (currentTongC < totalTong && data.isCheckListLai === 0) {
          // Update TongC if it is less than Tong
          await Tb_checklistc.update(
            { TongC: Sequelize.literal(`TongC + ${checklistLength}`) },
            { where: { ID_ChecklistC }, transaction }
          );
        }
      }

      // Update Ent_checklist Tinhtrang to 0
      await Ent_checklist.update(
        { Tinhtrang: 0 },
        { where: { ID_Checklist: { [Op.in]: ID_Checklists } }, transaction }
      );

      // Commit transaction after all operations are successful
      await transaction.commit();

      // Return success response
      res.status(200).json({
        message: "Checklist thành công!",
        data: createdData,
      });
    } catch (error) {
      // Rollback transaction if any operation fails
      await transaction.rollback();
      console.error("Error details:", error);
      res.status(500).json({
        error: error.message || "Failed to insert records into dynamic table",
      });
    }
  } catch (err) {
    // Handle any general errors
    return res.status(500).json({
      message: err.message || "Lỗi! Vui lòng thử lại sau.",
    });
  }
};


exports.getDataFormat = async (req, res) => {
  try {
    const checklistDoneItems = await Tb_checklistchitietdone.findAll({
      attributes: ["Description", "Gioht", "ID_ChecklistC"],
      where: { isDelete: 0 },
    });

    const arrPush = [];

    checklistDoneItems.forEach((item) => {
      const idChecklists = item.Description.split(",").map(Number);
      if (idChecklists.length > 0) {
        idChecklists.map((it) => {
          if (Number(item.ID_ChecklistC) === Number(req.params.idc)) {
            arrPush.push({
              ID_ChecklistC: parseInt(item.ID_ChecklistC),
              ID_Checklist: it,
              Gioht: item.Gioht,
            });
          }
        });
      }
    });

    // Trả về dữ liệu hoặc thực hiện các thao tác khác ở đây
    res.status(200).json(arrPush);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi lấy dữ liệu." });
  }
};
