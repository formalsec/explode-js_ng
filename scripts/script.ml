let rec find_reports input_dir =
  let rec loop handle acc =
    match Unix.readdir handle with
    | exception End_of_file -> acc
    (* Ignore "." and ".." dirs *)
    | "." | ".." -> loop handle acc
    | some_path ->
      let full_path = Filename.concat input_dir some_path in
      let acc =
        if not (Sys.is_directory full_path) then
          (* Ignore files which aren't report.json *)
          if String.equal some_path "report.json" then full_path :: acc else acc
        else
          (* Recursively look for more report.json in the next dir *)
          find_reports full_path @ acc
      in
      loop handle acc
  in
  loop (Unix.opendir input_dir) []

let parse_report report_path =
  let report_json = Yojson.Safe.from_file report_path in
  match Advisory.of_yojson report_json with
  | Ok advisory -> Format.printf "%a@." Advisory.pp_csv advisory
  | Error msg ->
    Format.kasprintf failwith "Failed to parse: %s: %s" report_path msg

let () =
  let reports = find_reports "examples" in
  Format.printf "package|version|advisory_id|cwe@.";
  List.iter parse_report reports
