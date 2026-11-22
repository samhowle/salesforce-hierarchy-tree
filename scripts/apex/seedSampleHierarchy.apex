// Creates a four-level Account hierarchy (31 accounts) for the Records instance on the Hierarchy Tree Demo page.
// For a scratch org. Running it again replaces the accounts it made before, which all start with the name prefix.
final String NAME_PREFIX = 'HT Demo ';
final String NAME_PATTERN = NAME_PREFIX + '%';

delete [SELECT Id FROM Account WHERE Name LIKE :NAME_PATTERN];

Account topRec = new Account(Name = NAME_PREFIX + 'Holdings', Type = 'Other');
insert topRec;

List<Account> divisions = new List<Account>();
for (String divisionName : new List<String>{ 'North', 'South', 'West' }) {
	divisions.add(new Account(
		Name = NAME_PREFIX + divisionName + ' Division',
		Type = 'Customer - Direct',
		ParentId = topRec.Id
	));
}
insert divisions;

List<Account> subsidiaries = new List<Account>();
for (Account divisionRec : divisions) {
	for (Integer i = 1; i <= 3; i++) {
		subsidiaries.add(new Account(
			Name = divisionRec.Name.removeEnd(' Division') + ' Subsidiary ' + i,
			Type = 'Customer - Channel',
			ParentId = divisionRec.Id
		));
	}
}
insert subsidiaries;

List<Account> sites = new List<Account>();
for (Account subsidiaryRec : subsidiaries) {
	for (Integer i = 1; i <= 2; i++) {
		sites.add(new Account(
			Name = subsidiaryRec.Name + ' Site ' + i,
			Type = 'Prospect',
			ParentId = subsidiaryRec.Id
		));
	}
}
insert sites;

System.debug('Hierarchy Tree demo accounts created: ' + (1 + divisions.size() + subsidiaries.size() + sites.size()));
