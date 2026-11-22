using System.Text.RegularExpressions;

class Zip {
    static readonly Regex Code = new Regex("^\\d{5}(-\\d{4})?$");
}
