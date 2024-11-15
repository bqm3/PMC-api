//check tầng data import excel
function checkDataExcel(data, index, key) {
  try {
    const tenKhuVuc = data['Tên khu vực']?.toLowerCase().normalize('NFC').trim();
    const tenHangMuc = data['Tên hạng mục']?.toLowerCase().normalize('NFC').trim();
    const tenTang = data['Tên tầng']?.toLowerCase().normalize('NFC').trim();

    const normalizeTang = (tang) => {
      const match = tang.match(/tầng\s*(\d+)/);
      if (match) {
        const number = parseInt(match[1], 10);
        if (number >= 1 && number <= 9) {
          return `tầng 0${number}`;
        }
      }
      return tang;
    };

    const normalizedTenTang = normalizeTang(tenTang);

    // So sánh chặt chẽ hơn bằng cách sử dụng biểu thức chính quy
    const isValidFloor = (khuVuc, tang) => {
      const pattern = new RegExp(`\\b${tang}\\b`);
      const normalizedPattern = new RegExp(`\\b${normalizedTenTang}\\b`);
      return pattern.test(khuVuc) || normalizedPattern.test(khuVuc);
    };

    if (tenTang && key === 1) {
      if (tenKhuVuc?.includes('tầng') && !isValidFloor(tenKhuVuc, tenTang)) {
        throw new Error(`Lỗi dòng ${index}, dữ liệu tầng của khu vực không hợp lệ`);
      }
    } else if (tenTang && key === 2) {
      if (tenHangMuc?.includes('tầng') && !isValidFloor(tenHangMuc, tenTang)) {
        throw new Error(`Lỗi dòng ${index}, dữ liệu tầng của hạng mục không hợp lệ`);
      }
    }
    
  } catch (err) {
    throw err;
  }
}

//format ngày
function convertDateFormat(inputDate) {
  // Kiểm tra xem inputDate có phải là chuỗi không
  if (typeof inputDate !== "string") {
    throw new Error("Sai địng dạng ngày DD/MM/YYYY."); 
  }

  // Tách ngày, tháng, năm
  const parts = inputDate.split("/");
  if (parts.length !== 3) {
    throw new Error("Invalid date format. Please use DD/MM/YYYY.");
  }

  const day = String(parts[0]).padStart(2, "0"); // Đảm bảo có 2 chữ số
  const month = String(parts[1]).padStart(2, "0"); // Đảm bảo có 2 chữ số
  const year = parts[2];

  // Trả về định dạng 'YYYY-MM-DD'
  return `${year}-${month}-${day}`;
}

function getPreviousMonth(month, year) {
  // Tạo một đối tượng Date từ tháng hiện tại và giảm đi 1 tháng
  const date = new Date(year, month - 1, 1); // month - 1 vì tháng trong Date bắt đầu từ 0
  date.setMonth(date.getMonth() - 1);

  // Trích xuất tháng và năm mới
  const previousMonth = date.getMonth() + 1; // Thêm 1 vì getMonth() trả về giá trị từ 0-11
  const previousYear = date.getFullYear();

  return { month: previousMonth, year: previousYear };
}

  const removeSpacesFromKeys = (obj) => {
    return Object.keys(obj).reduce((acc, key) => {
      const newKey = key?.replace(/\s+/g, "")?.toUpperCase();
      acc[newKey] = obj[key];
      return acc;
    }, {});
  };

  const formatVietnameseText = (text, i) => {
    // Kiểm tra nếu đầu vào không phải là chuỗi
    if (typeof text !== "string") {
      return text;
    }

    if(text == undefined || text == "" || text == null ){
      throw new Error("Cột không chứa dữ liệu ở dòng " + i); 
    }
  
    // Xóa khoảng trắng thừa và ký tự đặc biệt, chuyển chữ cái đầu của mỗi từ thành chữ hoa
    let formattedText = text
      .replace(/\s+/g, " ")
      .replace(/[.,!?:;]+/g, "")
      .toLowerCase()
      .trim()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  
    return formattedText;
  };

  //format text vn -> en
  function removeVietnameseTones(str) {
    if(str == null  || str == '' || str == undefined ) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }
  

module.exports = {
  convertDateFormat,
  checkDataExcel,
  formatVietnameseText,
  removeSpacesFromKeys,
  removeVietnameseTones,
  getPreviousMonth
};
