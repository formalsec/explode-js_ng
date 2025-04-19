type url = { url : string } [@@deriving yojson]

type cwe = string [@@deriving yojson]

type advisory = {
  id : string;
  cwe : cwe;
}
[@@deriving yojson { strict = false }]

type t = {
  package : string;
  version : string;
  advisory : advisory;
  correct_cwe : cwe;
  correct_package_link : string;
  poc : url list;
  patch : url list;
}
[@@deriving yojson { strict = false }]

let pp_csv fmt { package; version; advisory; _ } =
  Format.fprintf fmt "%s|%s|%s|%s" package version advisory.id advisory.cwe
