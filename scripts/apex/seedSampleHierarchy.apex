// Creates a four-level Account hierarchy (31 accounts) for the Records instances on the Hierarchy Tree Demo page.
// For a scratch org. Running it again replaces the accounts it made before, which all start with the name prefix.
// AccountNumber holds a {Type}-{ShortCode} code for the org-chart avatars; Industry, BillingCity and AnnualRevenue
// fill the columns.
final String NAME_PREFIX = 'HT Demo ';
final String NAME_PATTERN = NAME_PREFIX + '%';

delete [SELECT Id FROM Account WHERE Name LIKE :NAME_PATTERN];

// The demo accounts look alike on purpose; the org's duplicate rules would otherwise stop the inserts.
Database.DMLOptions dmlOptions = new Database.DMLOptions();
dmlOptions.DuplicateRuleHeader.allowSave = true;

final Map<String, String> CITY_BY_DIVISION = new Map<String, String>{ 'North' => 'Chicago', 'South' => 'Atlanta', 'West' => 'Denver' };
final List<String> INDUSTRIES = new List<String>{ 'Technology', 'Manufacturing', 'Retail' };

Account topRec = new Account(Name = NAME_PREFIX + 'Holdings', Type = 'Other', AccountNumber = 'HLD-HT',
	Industry = 'Finance', BillingCity = 'New York', AnnualRevenue = 48000000);
Database.insert(topRec, dmlOptions);

List<Account> divisions = new List<Account>();
for (String divisionName : new List<String>{ 'North', 'South', 'West' }) {
	divisions.add(new Account(
		Name = NAME_PREFIX + divisionName + ' Division',
		Type = 'Customer - Direct',
		ParentId = topRec.Id,
		AccountNumber = 'DIV-' + divisionName.left(1),
		Industry = INDUSTRIES[divisions.size()],
		BillingCity = CITY_BY_DIVISION.get(divisionName),
		AnnualRevenue = 16000000 - 2000000 * divisions.size()
	));
}
Database.insert(divisions, dmlOptions);

List<Account> subsidiaries = new List<Account>();
for (Account divisionRec : divisions) {
	for (Integer i = 1; i <= 3; i++) {
		subsidiaries.add(new Account(
			Name = divisionRec.Name.removeEnd(' Division') + ' Subsidiary ' + i,
			Type = 'Customer - Channel',
			ParentId = divisionRec.Id,
			AccountNumber = 'SUB-' + divisionRec.AccountNumber.right(1) + i,
			Industry = divisionRec.Industry,
			BillingCity = divisionRec.BillingCity,
			AnnualRevenue = 3000000 + 500000 * i
		));
	}
}
Database.insert(subsidiaries, dmlOptions);

List<Account> sites = new List<Account>();
for (Account subsidiaryRec : subsidiaries) {
	for (Integer i = 1; i <= 2; i++) {
		sites.add(new Account(
			Name = subsidiaryRec.Name + ' Site ' + i,
			Type = 'Prospect',
			ParentId = subsidiaryRec.Id,
			AccountNumber = 'SIT-' + subsidiaryRec.AccountNumber.right(2) + i,
			Industry = subsidiaryRec.Industry,
			BillingCity = subsidiaryRec.BillingCity
		));
	}
}
Database.insert(sites, dmlOptions);

System.debug('Hierarchy Tree demo accounts created: ' + (1 + divisions.size() + subsidiaries.size() + sites.size()));
