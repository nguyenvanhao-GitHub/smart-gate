// =============================================================================
// Từ điển thông báo tiếng Việt — ĐỒNG THỜI LÀ DANH MỤC KHÓA của toàn hệ thống.
//
// `MessageKey` được suy ra từ chính tệp này (`keyof typeof VI_MESSAGES`), nên:
//   · thêm khóa mới  = thêm một dòng ở đây, các ngôn ngữ khác lập tức báo lỗi biên dịch
//     ("thiếu bản dịch") — đó là cách bắt lỗi quên dịch ngay khi build;
//   · gọi sai tên khóa ở use-case = lỗi biên dịch, không phải chuỗi tự do.
//
// -----------------------------------------------------------------------------
// RANH GIỚI DỊCH — ĐỌC TRƯỚC KHI THÊM KHÓA
// -----------------------------------------------------------------------------
// CÓ dịch:      nhãn giao diện, thông báo lỗi trả về người dùng, lời văn cố định của hệ thống.
// KHÔNG dịch:   **dữ liệu danh mục trong database** (mã lý do, tên checklist, tên cổng/làn/bãi,
//               tên vai trò, loại chứng từ) và **dữ liệu nghiệp vụ** (tên doanh nghiệp, mô tả
//               hàng hóa, biển số). Đây là dữ liệu quản trị viên tự sửa qua giao diện, không phải
//               chuỗi giao diện. Nếu sau này cần đa ngữ cho chúng thì thêm cột `name_en` vào bảng
//               danh mục — KHÔNG nhét vào từ điển này.
// -----------------------------------------------------------------------------
//
// Quy ước nội suy: `{tên}` trong lời văn được thay bằng `messageParams.tên`.
// Nếu giá trị tham số **chính là một khóa thông báo** thì nó được dịch lồng (xem `translate.ts`)
// — nhờ đó nhãn kiểu "Duyệt" / "Thu hồi xác nhận" cũng đổi theo ngôn ngữ.
// =============================================================================

export const VI_MESSAGES = {
  // --- Chung ---------------------------------------------------------------
  'common.badRequest': 'Yêu cầu không hợp lệ.',
  'common.unauthorized': 'Bạn cần đăng nhập để thực hiện thao tác này.',
  'common.forbidden': 'Bạn không có quyền thực hiện thao tác này.',
  'common.notFound': 'Không tìm thấy dữ liệu yêu cầu.',
  'common.conflict': 'Thao tác xung đột với trạng thái hiện tại của dữ liệu.',
  'common.serverError': 'Hệ thống gặp sự cố. Vui lòng thử lại sau.',

  // --- Xác thực / phiên làm việc -------------------------------------------
  'auth.missingToken': 'Thiếu Bearer token.',
  'auth.invalidToken': 'Token không hợp lệ.',
  'auth.expiredToken': 'Token đã hết hạn.',
  'auth.invalidCredentials': 'Sai tài khoản hoặc mật khẩu.',
  'auth.accountLocked': 'Tài khoản đang bị khóa.',
  'auth.accountPending': 'Tài khoản đang chờ duyệt.',
  'auth.accountNotFound': 'Không tìm thấy tài khoản.',
  'auth.unknownActor': 'Không xác định được người dùng thực hiện thao tác.',
  'auth.unknownAccess': 'Không xác định được quyền của người dùng hiện tại.',
  'auth.endpointNotDeclared':
    'Endpoint chưa khai báo quyền truy cập nên bị từ chối theo nguyên tắc chặn mặc định.',
  'auth.permissionDenied': 'Bạn không có quyền thực hiện thao tác này (cần: {permissions}).',
  'auth.currentPasswordWrong': 'Mật khẩu hiện tại không đúng.',
  'auth.newPasswordSame': 'Mật khẩu mới phải khác mật khẩu hiện tại.',

  // --- Người dùng ----------------------------------------------------------
  'user.notFound': 'Không tìm thấy người dùng.',
  'user.duplicated': 'Tài khoản đã tồn tại.',
  'user.cannotDeleteSelf': 'Không được xóa chính tài khoản đang đăng nhập.',
  'user.cannotLockSelf': 'Không được khóa chính tài khoản đang đăng nhập.',
  'user.lockReasonRequired': 'Bắt buộc nhập lý do khóa tài khoản.',
  'user.notPending': 'Chỉ duyệt được tài khoản đang ở trạng thái chờ duyệt.',
  'auth.registerDuplicateUsername': 'Tên đăng nhập đã tồn tại.',
  'auth.registerDuplicateEmail': 'Thư điện tử đã tồn tại.',
  'auth.registerDuplicatePhone': 'Số điện thoại đã tồn tại.',
  'auth.registerDuplicateTaxCode': 'Mã số thuế đã tồn tại.',
  'auth.registerDuplicateIdNumber': 'CCCD đã tồn tại.',

  // --- Vai trò / phân quyền ------------------------------------------------
  'role.notFound': 'Không tìm thấy vai trò.',
  'role.notFoundForPermissions': 'Không tìm thấy vai trò cần cập nhật quyền.',
  'role.codeInvalid': 'Mã vai trò chỉ gồm chữ in hoa, số và dấu gạch dưới (2–64 ký tự).',
  'role.codeDuplicated': 'Mã vai trò đã tồn tại.',
  'role.systemImmutable': 'Không được xóa vai trò hệ thống.',
  'role.systemCannotLock': 'Không thể khóa vai trò hệ thống.',
  'role.inUse':
    'Vai trò đang gán cho {count} tài khoản nên không xóa được. Hãy gỡ vai trò khỏi các tài khoản trước.',
  'role.permissionUnknown': 'Mã quyền không hợp lệ: {codes}.',
  'role.unknownRoles': 'Vai trò không tồn tại: {codes}.',
  'role.systemAdminCoreRequired':
    'Không được gỡ các quyền quản trị cốt lõi của vai trò Quản trị hệ thống: {codes}. Nếu gỡ thì không còn ai quản trị được hệ thống.',

  // --- Danh mục ------------------------------------------------------------
  'catalog.typeNotFound': 'Không tìm thấy nhóm danh mục.',
  'catalog.itemNotFound': 'Không tìm thấy mục danh mục.',
  'catalog.itemCodeDuplicated': 'Mã danh mục đã tồn tại trong nhóm này.',
  'catalog.itemNameDuplicated': 'Tên danh mục đã tồn tại trong nhóm này.',
  'catalog.itemSortOrderDuplicated': 'Thứ tự sắp xếp đã tồn tại.',
  'catalog.itemSortOrderRequired': 'Vui lòng nhập thứ tự sắp xếp.',
  'catalog.itemSortOrderInvalid': 'Thứ tự phải là số nguyên khác 0.',
  'catalog.itemTypeMismatch': 'Mục danh mục không thuộc nhóm được chỉ định.',
  'catalog.typeCodeDuplicated': 'Mã nhóm danh mục đã tồn tại.',
  'catalog.typeNameDuplicated': 'Tên nhóm danh mục đã tồn tại.',
  'catalog.lockSystemForbidden': 'Không được khóa mục thuộc nhóm danh mục mặc định.',
  'catalog.itemDeleteSystemForbidden':
    'Mục thuộc nhóm danh mục mặc định của hệ thống chỉ được khóa, không được xóa.',
  'catalog.itemDeleteReferencedForbidden':
    'Chỉ được xóa mục do quản trị viên tự thêm và chưa phát sinh dữ liệu; mục đã khóa/đang dùng chỉ được khóa.',
  'catalog.typeDeleteSystemForbidden':
    'Không được xóa nhóm danh mục mặc định của hệ thống.',
  'catalog.typeDeleteNotEmpty':
    'Nhóm danh mục còn {count} mục bên trong nên không được xóa; hãy xóa hết mục trước.',

  // --- Hồ sơ (declarations) ------------------------------------------------
  'dossier.notFound': 'Không tìm thấy hồ sơ.',
  'dossier.forbidden': 'Bạn không có quyền truy cập hồ sơ này.',
  'dossier.idInvalid': 'Mã hồ sơ không đúng định dạng.',
  'dossier.missingId': 'Thiếu mã hồ sơ để xử lý nghiệp vụ.',
  'dossier.submitIncomplete': 'Hồ sơ chưa đủ điều kiện gửi. Vui lòng bổ sung các thông tin còn thiếu.',
  'dossier.missingDocument': 'Thiếu chứng từ bắt buộc: {name}.',
  'dossier.appointmentInPast': 'Lịch vào cửa khẩu không được ở thời điểm quá khứ.',
  'dossier.missingEnterpriseTaxCode': 'Chưa khai thông tin mã số thuế / số CCCD.',
  'dossier.invalidEnterpriseTaxCode': 'Mã số thuế phải gồm 10 chữ số, hoặc 10 chữ số kèm 3 chữ số mã đơn vị phụ thuộc.',
  'dossier.missingIdNumber': 'Chưa khai số CCCD / hộ chiếu.',
  'dossier.invalidIdNumber': 'Số CCCD / hộ chiếu không đúng định dạng (6-32 ký tự).',
  'dossier.missingEnterpriseName': 'Chưa khai tên doanh nghiệp / người khai.',
  'dossier.missingRepresentative': 'Chưa khai người đại diện.',
  'dossier.missingPhone': 'Chưa khai số điện thoại liên hệ.',
  'dossier.invalidPhone': 'Số điện thoại liên hệ không hợp lệ.',
  'dossier.missingEmail': 'Chưa khai thư điện tử liên hệ.',
  'dossier.invalidEmail': 'Thư điện tử liên hệ không hợp lệ.',
  'dossier.missingAddress': 'Chưa khai địa chỉ liên hệ.',
  'dossier.missingVehicles': 'Hồ sơ phải có một phương tiện vận chuyển.',
  'dossier.missingPlateNumber': '{tag}Chưa khai biển kiểm soát.',
  'dossier.invalidPlateNumber': '{tag}Biển kiểm soát không đúng định dạng.',
  'dossier.missingVehicleType': '{tag}Chưa chọn loại phương tiện.',
  'dossier.missingContainerNumber': '{tag}Chưa khai số container.',
  'dossier.missingTrailerNumber': '{tag}Chưa khai số moóc.',
  'dossier.missingTransportLicense': '{tag}Chưa khai giấy phép vận tải.',
  'dossier.missingPayloadWeight': '{tag}Chưa khai trọng tải.',
  'dossier.invalidPayloadWeight': '{tag}Trọng lượng phải lớn hơn 0.',
  'dossier.missingDriverName': '{tag}Chưa khai họ tên lái xe.',
  'dossier.missingDriverDocType': '{tag}Chưa chọn loại giấy tờ của lái xe.',
  'dossier.missingDriverDocNo': '{tag}Chưa khai số giấy tờ tùy thân của lái xe.',
  'dossier.missingDriverLicenseNo': '{tag}Chưa khai số GPLX của lái xe.',
  'dossier.missingDriverPhone': '{tag}Chưa khai số điện thoại của lái xe.',
  'dossier.missingDriverNationality': '{tag}Chưa chọn quốc tịch của lái xe.',
  'dossier.missingCargoItems': 'Hồ sơ phải có ít nhất một dòng hàng hóa.',
  'dossier.missingCargoType': '{tag}Chưa chọn loại hàng hóa.',
  'dossier.missingCargoName': '{tag}Chưa khai tên hàng hóa.',
  'dossier.missingQuantity': '{tag}Chưa khai số lượng.',
  'dossier.invalidQuantity': '{tag}Số lượng phải lớn hơn 0.',
  'dossier.missingUnit': '{tag}Chưa chọn đơn vị tính.',
  'dossier.missingCargoWeight': '{tag}Chưa khai trọng lượng.',
  'dossier.invalidCargoWeight': '{tag}Khối lượng phải lớn hơn 0.',
  'dossier.missingScheduledAt': 'Vui lòng chọn ngày đăng ký vào cửa khẩu.',
  'dossier.statusCancelled': 'Hồ sơ đã bị hủy nên không gửi được.',
  'dossier.lockedForEdit':
    'Hồ sơ đã gửi nên không sửa được. Chỉ hồ sơ nháp hoặc bị yêu cầu bổ sung mới sửa được.',
  'dossier.cannotCancelPastGate':
    'Hồ sơ chỉ được phép hủy khi ở trạng thái "Chờ vào cổng". Khi xe đã được duyệt vào cổng, không thể hủy hồ sơ.',
  'dossier.attachmentsLocked': 'Hồ sơ đã gửi nên không thay đổi được chứng từ đính kèm.',
  'dossier.noAttachmentSelected': 'Chưa chọn tệp nào để gắn vào hồ sơ.',
  'dossier.attachmentMissing': 'Không tìm thấy tệp đính kèm: {codes}.',
  'dossier.attachmentDeleted': 'Không gắn được tệp đã bị xóa vào hồ sơ.',
  'dossier.attachmentOwnedByOther': 'Tệp đính kèm đang thuộc hồ sơ khác nên không gắn lại được.',
  'dossier.attachmentNotInDossier': 'Không tìm thấy tệp đính kèm trong hồ sơ này.',
  'dossier.copyAttachmentUnavailable':
    'Chưa cấu hình kho lưu trữ nên không sao chép được tệp đính kèm của hồ sơ. Vui lòng liên hệ quản trị viên.',
  'dossier.feeNotFound': 'Không tìm thấy hồ sơ/tờ khai phí.',
  'dossier.plateInUse':
    'Biển số {plateNumber} đang nằm trong một hồ sơ khác ({code}) chưa kết thúc. Mỗi biển số chỉ được có một hồ sơ đang xử lý.',
  'dossier.driverIdInUse':
    'Số CCCD/Hộ chiếu {idNumber} của lái xe đang nằm trong một hồ sơ khác ({code}) chưa kết thúc. Mỗi lái xe chỉ được có một hồ sơ đang xử lý.',
  'dossier.tagVehicle': 'Phương tiện {index}: ',
  'dossier.tagCargo': 'Dòng hàng {index}: ',

  // --- Doanh nghiệp / lái xe / phương tiện (registry dùng lại) --------------
  'enterprise.notFound': 'Không tìm thấy doanh nghiệp.',
  'enterprise.taxCodeDuplicated': 'Mã số thuế "{taxCode}" đã tồn tại trong hệ thống.',
  'enterpriseDriver.notFound': 'Không tìm thấy lái xe.',
  'enterpriseDriver.idNumberDuplicated': 'Số giấy tờ "{idNumber}" đã tồn tại cho doanh nghiệp này.',
  'enterpriseVehicle.notFound': 'Không tìm thấy phương tiện.',
  'enterpriseVehicle.plateDuplicated': 'Biển số "{plateNumber}" đã tồn tại cho doanh nghiệp này.',

  // --- Tệp đính kèm & kho lưu trữ ------------------------------------------
  'file.notFound': 'Không tìm thấy tệp đính kèm.',
  'file.deleted': 'Tệp đính kèm đã bị xóa.',
  'file.forbidden': 'Bạn không có quyền truy cập tệp đính kèm này.',
  'file.forbiddenDossier': 'Bạn không có quyền truy cập tệp đính kèm của hồ sơ này.',
  'file.idInvalid': 'Mã tệp đính kèm không đúng định dạng.',
  'file.notSelected': 'Chưa chọn tệp để tải lên (trường "file").',
  'file.emptyContent': 'Không đọc được nội dung tệp hoặc tệp rỗng.',
  'file.tooLarge': 'Tệp vượt quá dung lượng cho phép (tối đa {max} MB).',
  'file.typeNotAllowed': 'Định dạng tệp không được phép. Chỉ chấp nhận: {allowed}.',
  'file.extensionMismatch':
    'Phần mở rộng "{extension}" không khớp với nội dung thật của tệp ({detected}).',
  'file.documentTypeInvalid': 'Mã loại chứng từ không tồn tại hoặc đã bị khóa trong danh mục.',
  'storage.notConfigured': 'Hệ thống chưa cấu hình kho lưu trữ tệp đính kèm. Vui lòng liên hệ quản trị viên.',
  'storage.notConfiguredUpload':
    'Hệ thống chưa cấu hình kho lưu trữ tệp đính kèm nên chưa tải tệp lên được. Vui lòng liên hệ quản trị viên.',
  'storage.notConfiguredDownload':
    'Hệ thống chưa cấu hình kho lưu trữ tệp đính kèm nên chưa tải tệp về được. Vui lòng liên hệ quản trị viên.',
  'storage.emptyObject': 'Kho lưu trữ trả về nội dung rỗng cho tệp đính kèm.',
  'storage.unavailable':
    'Kho lưu trữ tệp đính kèm đang không sẵn sàng. Vui lòng thử lại sau hoặc liên hệ quản trị viên.',

  // --- Quy trình liên ngành ------------------------------------------------
  'workflow.dossierNotSubmitted': 'Hồ sơ còn là bản nháp, chưa được gửi nên chưa vào quy trình liên ngành.',
  'workflow.dossierCancelled': 'Hồ sơ đã bị hủy nên không mở được quy trình liên ngành.',
  'workflow.routeNotConfigured':
    'Chưa cấu hình bước xử lý cho loại hồ sơ {type} trong bảng "workflow_step_roles".',
  'workflow.unknownStep': 'Bước "{step}" không thuộc quy trình của loại hồ sơ {dossierType}.',
  'workflow.flowRejected': 'Hồ sơ đã bị từ chối nên không thao tác thêm được trên quy trình.',
  'workflow.flowCompleted': 'Hồ sơ đã hoàn tất quy trình liên ngành nên không thao tác thêm được.',
  'workflow.alreadyDecided': 'Bước "{step}" đã có kết luận, không thể quyết định lại.',
  'workflow.waitingSupplement': 'Bước "{step}" đang ở trạng thái chờ doanh nghiệp bổ sung/chỉnh sửa thông tin, cán bộ không thể thực hiện thao tác lúc này.',
  'workflow.waitingCall': 'Hồ sơ đang ở trạng thái Chờ gọi. Cần Điều phối gọi xe vào kiểm tra trước khi thực hiện duyệt hồ sơ.',
  'workflow.outOfOrder': 'Sai thứ tự xử lý: hồ sơ đang chờ {expected}, chưa đến lượt bước "{step}".',
  'workflow.nextStepFallback': 'bước kế tiếp của quy trình',
  'workflow.otherAgency': 'lực lượng khác',
  'workflow.roleNotAllowed': 'Vai trò hiện tại không được xử lý bước "{step}" (thuộc {agency}).',
  'workflow.gateStepNotDecidable':
    'Bước "{step}" là bước cổng, chỉ hoàn thành khi xe qua cổng (sự kiện cổng) ở màn Cổng vào/ra, không quyết định ở màn Xử lý liên ngành.',
  'workflow.quarantinePriorityRequired':
    'Hồ sơ có yêu cầu ưu tiên kiểm dịch: phải hoàn thành bước Kiểm dịch trước khi Biên phòng và Hải quan xử lý bước "{step}".',
  'workflow.reasonCodeRequired': 'Thao tác "{decision}" bắt buộc phải chọn mã nguyên nhân.',
  'workflow.reasonNoteRequired': 'Thao tác "{decision}" bắt buộc phải nhập nội dung lý do.',
  'workflow.reasonCodeInvalid': 'Mã nguyên nhân "{reasonCode}" không có trong danh mục đang hiệu lực.',
  'workflow.forbiddenSupplement':
    'Bạn không có quyền yêu cầu bổ sung hồ sơ (cần: workflow.update hoặc workflow.approve).',
  'workflow.forbiddenDecide': 'Bạn không có quyền kết luận bước nghiệp vụ này (cần: workflow.approve).',
  'workflow.supplementViaWorkflowScreen':
    'Yêu cầu bổ sung hồ sơ phải thực hiện ở màn hình Xử lý liên ngành để chọn mã nguyên nhân bắt buộc.',
  'workflow.roleNotAllowedScreen': 'Vai trò hiện tại không được phép thực hiện tác vụ trên màn hình này.',
  'workflow.feeRoleNotAllowed': 'Vai trò hiện tại không được phép thực hiện tác vụ phí này.',
  // Lực lượng chuyên ngành (dùng cho thông báo và hiển thị đa ngôn ngữ)
  'workflow.agency.ENTERPRISE': 'Doanh nghiệp',
  'workflow.agency.BORDER_GUARD': 'Biên phòng',
  'workflow.agency.CUSTOMS': 'Hải quan',
  'workflow.agency.QUARANTINE': 'Kiểm dịch',
  'workflow.agency.FEE_COLLECTOR': 'Cơ quan thu phí',
  'workflow.agency.DEFAULT': 'lực lượng chuyên ngành',
  // Nhãn thao tác — dùng làm tham số lồng cho `workflow.reason*` nên phải là khóa, không phải hằng chuỗi.
  'workflow.decision.APPROVE': 'Duyệt',
  'workflow.decision.REQUEST_SUPPLEMENT': 'Yêu cầu bổ sung',
  'workflow.decision.REJECT': 'Từ chối',

  // --- Cổng ----------------------------------------------------------------
  'gate.catalogMissing': 'Danh mục cổng cửa khẩu chưa được cấu hình. Liên hệ quản trị hệ thống.',
  'gate.notFound': 'Không có cổng "{gateCode}" trong danh mục cửa khẩu.',
  'gate.inactive': 'Cổng "{gateName}" đang tạm ngừng khai thác.',
  'gate.noActiveGate': 'Không có cổng nào đang hoạt động trong danh mục cửa khẩu.',
  'gate.dossierNotFound': 'Không tìm thấy hồ sơ để ghi sự kiện cổng.',
  'gate.dossierNotFoundByCode': 'Không tìm thấy hồ sơ có mã "{code}".',
  'gate.blocked': 'Hồ sơ {dossierCode} chưa đủ điều kiện qua cổng {gateName}.',
  'gate.alreadyLeft': 'Hồ sơ {dossierCode} đã rời cửa khẩu nên không ghi thêm lượt qua cổng {gateName} được.',
  'gate.duplicateEntry': 'Hồ sơ {dossierCode} đã được cho vào ở cổng {gateName} trước đó rồi.',
  'gate.duplicateExit': 'Hồ sơ {dossierCode} đã được cho ra ở cổng {gateName} trước đó rồi.',
  'gate.exitBeforeEntry': 'Chưa ghi nhận lượt vào nên chưa thể cho hồ sơ {dossierCode} ra ở cổng {gateName}.',
  'gate.entryAfterExit': 'Hồ sơ {dossierCode} đã ra khỏi cửa khẩu nên không cho vào lại ở cổng {gateName} được.',
  'gate.duplicatePassage': 'Hồ sơ {dossierCode} vừa được ghi nhận qua cổng {gateName} ở lượt khác. Vui lòng tra cứu lại.',
  'gate.notEligibleForEntry': 'Hồ sơ {code} không ở trạng thái chờ vào cổng (chỉ tra cứu hồ sơ ở trạng thái Đã gửi và chưa qua cổng vào).',
  'gate.notEligibleForExit': 'Hồ sơ {code} chưa được duyệt vào cổng hoặc đã hoàn thành/rời cửa khẩu.',

  // --- Điều phối / bãi -----------------------------------------------------
  'dispatch.idInvalid': 'Mã vị trí điều phối không đúng định dạng.',
  'dispatch.dossierNotFound': 'Không tìm thấy hồ sơ cần điều phối.',
  'dispatch.assignmentNotFound': 'Không tìm thấy vị trí điều phối cần chuyển.',
  'dispatch.assignmentReleased': 'Vị trí này đã được giải phóng nên không chuyển được.',
  'dispatch.assignmentDossierNotFound': 'Không tìm thấy hồ sơ của vị trí điều phối này.',
  'dispatch.releaseNotFound': 'Không tìm thấy vị trí điều phối cần giải phóng.',
  'dispatch.vehicleAlreadyPlaced':
    'Xe của hồ sơ {dossierCode} đang ở một vị trí khác. Hãy chuyển vị trí hoặc giải phóng vị trí hiện tại trước.',
  'dispatch.slotOccupied': 'Ô đỗ {slotCode} đang có xe khác. Hãy chọn ô còn trống.',
  'dispatch.slotJustTaken': 'Ô đỗ {slotCode} vừa được xe khác chiếm. Hãy chọn ô còn trống.',
  'dispatch.vehicleJustMoved':
    'Xe của hồ sơ {dossierCode} vừa được gán vị trí khác. Hãy tải lại bảng điều phối.',
  'dispatch.placementRequired': 'Phải chọn ít nhất một vị trí: cổng, làn hoặc ô đỗ trong bãi.',
  'dispatch.slotNeedsYard': 'Chọn ô đỗ thì phải chọn khu bãi tương ứng.',
  'dispatch.yardNeedsSlot': 'Chọn khu bãi thì phải chọn ô đỗ cụ thể.',
  'dispatch.laneNeedsGate': 'Chọn làn thì phải chọn cổng tương ứng.',
  'dispatch.laneNotFound': 'Không có làn "{laneCode}" trong danh mục cửa khẩu.',
  'dispatch.laneInactive': 'Làn "{laneName}" đang tạm ngừng khai thác.',
  'dispatch.laneNotInGate': 'Làn "{laneName}" không thuộc cổng "{gateCode}".',
  'dispatch.gateDirectionMismatch':
    'Cổng "{gateName}" ({gateCode}) không đúng chiều luồng của hồ sơ: hồ sơ nhập chỉ gán cổng chiều vào, hồ sơ xuất chỉ gán cổng chiều ra.',
  'dispatch.inspectionInvalidTransition':
    'Không chuyển được trạng thái kiểm tra từ "{from}" sang "{to}" — sai thứ tự quy trình kiểm tra/tập kết.',
  'dispatch.inspectionNotActive':
    'Vị trí điều phối đã được giải phóng nên không cập nhật trạng thái kiểm tra được.',
  'dispatch.placementGate': 'cổng {code}',
  'dispatch.placementLane': 'làn {code}',
  'dispatch.placementSlot': 'ô đỗ {code}',
  'dispatch.placementDefault': 'vị trí mới',
  'yard.idInvalid': 'Mã khu bãi không đúng định dạng.',
  'yard.notFound': 'Không tìm thấy khu bãi.',
  'yard.notFoundSelected': 'Không tìm thấy khu bãi được chọn.',
  'yard.inactive': 'Khu bãi "{yardName}" đang tạm ngừng khai thác.',
  'yard.slotNotFound': 'Khu bãi "{yardName}" không có ô đỗ "{slotCode}".',
  'yard.slotLockedOccupied': 'Ô đỗ "{slotCode}" đang có xe nên không thể khoá. Hãy giải phóng ô trước.',
  'yardZone.notFound': 'Không tìm thấy khu bãi cần cập nhật.',
  'yardZone.invalidCapacity': 'Sức chứa khu bãi phải là số nguyên không âm.',
  'yardZone.cannotReduceOccupied': 'Không thể giảm sức chứa vì có xe đang đỗ trong khu bãi hoặc ở các ô bị giảm.',
  'yardZone.cannotReduceSlotOccupied':
    'Không thể giảm sức chứa xuống {capacity} vì các ô đỗ bị xóa ({slots}) đang có xe đứng: {details}. Vui lòng giải phóng hoặc chuyển ô cho xe trước khi giảm.',
  'yardZone.cannotReduceCapacityBelowOccupied':
    'Không thể giảm sức chứa xuống {capacity} ô vì khu bãi đang có {occupied} xe đỗ (vượt quá sức chứa mới). Vui lòng giải phóng hoặc chuyển ô bớt xe trước khi giảm.',

  // --- Hàng đợi ------------------------------------------------------------
  'queue.dossierNotFound': 'Không tìm thấy hồ sơ cần cấp số thứ tự.',
  'queue.dossierNotSubmitted': 'Hồ sơ chưa được gửi hoặc đã kết thúc nên không cấp được số thứ tự.',
  'queue.conflict': 'Hệ thống đang cấp số cho nhiều hồ sơ cùng lúc. Vui lòng bấm cấp số lại.',

  // --- Tác nghiệp theo màn hình --------------------------------------------
  'operation.screenNotFound': 'Không có màn tác nghiệp với mã "{slug}".',
  'operation.actionNotFound': 'Hành động "{action}" không thuộc màn tác nghiệp "{slug}".',
  'operation.stepNotFound': 'Bước tác nghiệp "{step}" không có trong danh mục.',
  'operation.screenHasNoConfirm': 'Màn tác nghiệp "{slug}" không ghi nhận xác nhận của lực lượng nào.',

  // --- Thu phí --------------------------------------------------------------
  'fee.screenNotFound': 'Không có màn thu phí với mã "{slug}".',
  'fee.actionNotFound': 'Hành động thu phí "{action}" không thuộc màn "{slug}".',
  'fee.methodNotFound': 'Phương thức thanh toán "{method}" không hợp lệ.',
  'fee.dossierNotFound': 'Không tìm thấy hồ sơ cần tính phí.',
  'fee.chargeNotFound': 'Hồ sơ chưa có khoản phí "{ruleCode}" để điều chỉnh. Hãy tính phí trước.',
  'fee.reasonCodeRequired': 'Điều chỉnh khoản phí bắt buộc phải có mã lý do.',
  'fee.reasonCodeInvalid': 'Mã lý do "{reasonCode}" không có trong danh mục lý do điều chỉnh phí hoặc đã bị khóa.',
  'fee.amountInvalid': 'Số tiền điều chỉnh phải là số nguyên đồng không âm.',
  'fee.transactionNotFound': 'Không tìm thấy giao dịch thu phí.',
  'fee.transactionAmountInvalid': 'Số tiền giao dịch phải lớn hơn 0.',
  'fee.transactionExceedsOutstanding':
    'Số tiền {amount} vượt quá phần còn phải thu ({outstanding}) của hồ sơ.',
  'fee.transactionDuplicateReference': 'Mã giao dịch "{referenceCode}" đã được ghi nhận cho hồ sơ này.',
  'fee.stepNotReached': 'Hồ sơ chưa tới bước thu phí trong quy trình nên chưa thể thu phí.',
  'fee.notSettled':
    'Chưa thể duyệt bước thu phí: hồ sơ còn {outstanding} {currency} phí chưa được xác nhận thanh toán.',
  'fee.ruleNotFound': 'Không tìm thấy bản biểu phí cần sửa.',
  'fee.ruleDuplicateVersion': 'Mã "{code}" đã có bản hiệu lực từ ngày {effectiveFrom}. Chọn ngày hiệu lực khác.',
  'fee.ruleEffectiveFromTooEarly':
    'Ngày hiệu lực {effectiveFrom} phải sau ngày bắt đầu của bản đang chạy ({current}).',
  'fee.ruleAmountLocked':
    'Không sửa được mức phí của bản đã hoặc đang áp dụng. Hãy tạo bản mới với ngày hiệu lực sau để giữ lịch sử.',

  // --- Báo cáo -------------------------------------------------------------
  'report.notFound': 'Không tìm thấy báo cáo có mã "{code}".',

  // --- Thông báo -----------------------------------------------------------
  'notification.notFound': 'Không tìm thấy thông báo.',
  'notification.forbidden': 'Bạn không được đánh dấu thông báo của người dùng khác.',
  'notification.dossierCancelledTitle': 'Hồ sơ {code} đã bị hủy',
  'notification.dossierCancelledContent': '{note}',
  'notification.dossierCancelledDefaultNote': 'Hồ sơ đã được hủy trên hệ thống.',
  'notification.dossierSubmittedTitle': 'Hồ sơ {code} đã được gửi',
  'notification.dossierSubmittedContent': 'Hồ sơ {code} đã được gửi lên hệ thống và đang chờ các lực lượng chuyên ngành xử lý.',
  'notification.dossierNewPendingTitle': 'Hồ sơ mới {code} đang chờ xử lý',
  'notification.dossierNewPendingContent': 'Hồ sơ {code} đang chờ xác nhận vào cổng.',
  'notification.dossierTurnProcessingTitle': 'Hồ sơ {code} đến lượt xử lý',
  'notification.dossierTurnProcessingFeeContent': 'Hồ sơ {code} đã hoàn tất xử lý liên ngành và đang chờ thu phí.',
  'notification.dossierTurnProcessingStepContent': 'Hồ sơ {code} đã được chuyển đến bước "{stepName}". Vui lòng kiểm tra và xử lý.',
  'notification.dossierAssignedTitle': 'Hồ sơ {code} đã được điều phối vị trí',
  'notification.dossierAssignedContent': 'Phương tiện của hồ sơ {code} được điều phối tới {placement}.',
  'notification.dossierMovedTitle': 'Hồ sơ {code} đã được chuyển vị trí',
  'notification.dossierMovedContent': 'Phương tiện của hồ sơ {code} được chuyển tới {placement}.',
  'notification.vehicleInspectionTitle': 'Xe ({plateNumber}) vào kiểm tra',
  'notification.vehicleInspectionContentWithTicket': 'Phương tiện {plateNumber} (Số thứ tự {ticketCode}) đã được gọi vào khu vực kiểm tra nghiệp vụ.',
  'notification.vehicleInspectionContentNoTicket': 'Phương tiện {plateNumber} đã được gọi vào khu vực kiểm tra nghiệp vụ.',
  'notification.feeSettledTitle': 'Hồ sơ {code} đã hoàn thành nghĩa vụ tài chính',
  'notification.feeSettledContent': 'Hồ sơ {code} đã thu đủ {total} {currency}.',
  'notification.feePartialTitle': 'Hồ sơ {code} đã được ghi nhận một khoản thanh toán',
  'notification.feePartialContent': 'Hồ sơ {code} còn phải thu {outstanding} {currency}.',
  'notification.feeWaitingExitTitle': 'Hồ sơ {code} đang chờ xác nhận ra cổng',
  'notification.feeWaitingExitContent': 'Hồ sơ {code} đã hoàn tất thu phí và đang chờ xác nhận ra cổng.',
  'notification.gateAllowedTitle': 'Xe {plateNumber} đã được cho qua cổng',
  'notification.gateAllowedContent': 'Phương tiện của hồ sơ {code} đã được {actorText}cho qua cổng.',
  'notification.gateDeniedTitle': 'Hồ sơ {code} bị từ chối tại cổng {gateName}',
  'notification.gateDeniedContent': 'Phương tiện của hồ sơ {code} chưa được qua cổng {gateName}.',
  'notification.gateDeniedContentWithBlocking': 'Phương tiện của hồ sơ {code} chưa được qua cổng {gateName}. Điều kiện còn thiếu: {reasons}',
  'notification.vehicleWaitingDispatchTitle': 'Xe {plateNumber} đang chờ điều phối',
  'notification.vehicleWaitingDispatchContent': 'Xe {plateNumber} đang chờ điều phối.',
  'notification.userRegisteredTitle': 'Tài khoản mới chờ phê duyệt',
  'notification.userRegisteredContent': 'Tài khoản {username} vừa được đăng ký và đang ở trạng thái Chờ duyệt. Vui lòng kiểm tra và thực hiện phê duyệt.',
  'notification.workflowSupplementTitle': 'Hồ sơ {code} được {agency} yêu cầu sửa đổi, bổ sung',
  'notification.workflowSupplementContent': 'Hồ sơ {code} được {agency} yêu cầu sửa đổi, bổ sung.',
  'notification.workflowSupplementContentWithNote': 'Hồ sơ {code} được {agency} yêu cầu sửa đổi, bổ sung. Ghi chú: {note}',
  'notification.workflowRejectedTitle': 'Hồ sơ {code} đã bị {agency} từ chối',
  'notification.workflowRejectedContent': 'Hồ sơ {code} đã bị {agency} từ chối.',
  'notification.workflowRejectedContentWithNote': 'Hồ sơ {code} đã bị {agency} từ chối. Ghi chú: {note}',
  'notification.workflowApprovedTitle': 'Hồ sơ {code} đã được {agency} duyệt thành công',
  'notification.workflowApprovedContent': 'Hồ sơ {code} đã được {agency} duyệt thành công.',
  'notification.workflowApprovedContentWithNote': 'Hồ sơ {code} đã được {agency} duyệt thành công. Ghi chú: {note}',

  // --- Cấu hình hệ thống ---------------------------------------------------
  'systemSetting.emptyUpdate': 'Không có tham số cấu hình nào để cập nhật.',
  'systemSetting.keyUnknown': 'Tham số cấu hình "{key}" không có trong danh mục.',
  'systemSetting.valueInvalid': 'Giá trị của "{key}" phải là số nguyên trong khoảng từ {min} đến {max}.',
} as const;
